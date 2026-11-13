import type { Prisma } from "@prisma/client";
import { parseAnswers } from "@/src/lib/applications/answers";
import { parseApplicationConfig } from "@/src/lib/applications/config";
import { aggregateRanks, isReleased, normalizeOrder, relativeStandings, tallyVotes, type AiScores } from "@/src/lib/applications/desk";
import { prisma } from "@/src/lib/prisma";
import { listVoters, type ApplicationsViewer } from "@/src/server/applications/access";
import { audit, getRoundOrThrow, roughCutPlayback, roughCutSourceText } from "@/src/server/applications/rounds";

/** Reviewer side: lists, one applicant, notes, rankings, votes and release. Callers check reviewer/manager access. */

type AiRead = { scores: AiScores; summary: string; model?: string };

function parseAiRead(value: unknown): AiRead | null {
  if (!value || typeof value !== "object") return null;
  const read = value as Partial<AiRead>;
  return read.scores && typeof read.scores === "object" ? { scores: read.scores, summary: String(read.summary ?? ""), model: read.model } : null;
}

function applicantName(application: { mockName: string | null; user: { name: string | null; email: string | null } | null }) {
  return application.mockName ?? (application.user?.name?.trim() || application.user?.email || "Applicant");
}

async function loadPool(roundId: string) {
  return prisma.application.findMany({
    where: { roundId },
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { name: true, email: true } }, votes: { select: { voterId: true, optionKey: true } }, _count: { select: { notes: true } } }
  });
}

export async function getRoundOverview(viewer: ApplicationsViewer, roundId: string) {
  const round = await getRoundOrThrow(roundId);
  const config = parseApplicationConfig(round.config);
  const [applications, voters, rankings] = await Promise.all([
    loadPool(roundId),
    listVoters(),
    prisma.applicationRanking.findMany({ where: { roundId }, include: { reviewer: { select: { name: true, email: true } } } })
  ]);
  const submitted = applications.filter((application) => application.status === "SUBMITTED");
  const submittedIds = submitted.map((application) => application.id);
  const mine = rankings.find((ranking) => ranking.reviewerId === viewer.userId) ?? null;
  // Others' orders stay hidden until you've submitted yours (the adviser never ranks, so sees them).
  const seesOthers = Boolean(mine?.submittedAt) || !viewer.canManage;
  const submittedRankings = rankings.filter((ranking) => ranking.submittedAt);
  const ranks = aggregateRanks(
    submittedRankings.map((ranking) => normalizeOrder(ranking.order, submittedIds)),
    submittedIds
  );
  const reads = submitted.flatMap((application) => {
    const read = parseAiRead(application.aiRead);
    return read ? [{ id: application.id, scores: read.scores }] : [];
  });
  const standings = relativeStandings(reads, config.rubric.map((criterion) => criterion.key));
  const voterIds = new Set(voters.map((voter) => voter.id));

  return {
    round: {
      id: round.id,
      title: round.title,
      positionLabel: round.positionLabel,
      status: round.status,
      opensAt: round.opensAt?.toISOString() ?? null,
      dueAt: round.dueAt.toISOString(),
      releaseAt: round.releaseAt?.toISOString() ?? null,
      released: isReleased(round.releaseAt)
    },
    decisions: config.decisions,
    rubric: config.rubric,
    voters,
    viewer: { userId: viewer.userId, canManage: viewer.canManage, isVoter: voterIds.has(viewer.userId) },
    myRanking: mine
      ? {
          order: normalizeOrder(mine.order, submittedIds),
          reasons: (mine.reasons ?? {}) as Record<string, string>,
          submittedAt: mine.submittedAt?.toISOString() ?? null
        }
      : null,
    seesOthers,
    rankers: seesOthers
      ? submittedRankings.map((ranking) => ({
          reviewerId: ranking.reviewerId,
          name: ranking.reviewer.name?.trim() || ranking.reviewer.email || "Producer",
          order: normalizeOrder(ranking.order, submittedIds),
          reasons: (ranking.reasons ?? {}) as Record<string, string>
        }))
      : [],
    applications: applications.map((application) => {
      const answers = parseAnswers(application.answers);
      const votes = application.votes.filter((vote) => voterIds.has(vote.voterId));
      const tally = tallyVotes(votes.map((vote) => vote.optionKey), voters.length);
      const rank = ranks.get(application.id);
      const standing = standings.get(application.id) ?? null;
      return {
        id: application.id,
        name: applicantName(application),
        isMock: application.isMock,
        status: application.status,
        submittedAt: application.submittedAt?.toISOString() ?? null,
        updatedAt: application.updatedAt.toISOString(),
        grade: answers.grade,
        topRole: answers.rolePrefs[0] ?? "",
        notes: application._count.notes,
        averageRank: seesOthers ? (rank?.average ?? null) : null,
        rankCount: rank?.ranks.length ?? 0,
        ai: standing ? { place: standing.place, of: standing.of, total: standing.total } : null,
        tally: { counts: tally.counts, winner: tally.winner, needed: tally.needed, cast: tally.cast },
        myVote: application.votes.find((vote) => vote.voterId === viewer.userId)?.optionKey ?? null,
        decisionKey: application.decisionKey,
        extensionUntil: application.extensionUntil?.toISOString() ?? null
      };
    })
  };
}

export type RoundOverview = Awaited<ReturnType<typeof getRoundOverview>>;

export async function getApplicationDetail(viewer: ApplicationsViewer, roundId: string, applicationId: string) {
  const round = await getRoundOrThrow(roundId);
  const application = await prisma.application.findFirst({
    where: { id: applicationId, roundId },
    include: {
      user: { select: { name: true, email: true } },
      notes: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, email: true } } } },
      votes: { include: { voter: { select: { name: true, email: true } } } }
    }
  });
  if (!application) throw new Error("NOT_FOUND");
  const config = parseApplicationConfig(round.config);
  const [voters, pool, playbackUrl] = await Promise.all([
    listVoters(),
    prisma.application.findMany({ where: { roundId, status: "SUBMITTED" }, select: { id: true, aiRead: true } }),
    roughCutPlayback(round).catch(() => null)
  ]);
  const reads = pool.flatMap((row) => {
    const read = parseAiRead(row.aiRead);
    return read ? [{ id: row.id, scores: read.scores }] : [];
  });
  const standing = relativeStandings(reads, config.rubric.map((criterion) => criterion.key)).get(application.id) ?? null;
  const voterIds = new Set(voters.map((voter) => voter.id));
  const votes = application.votes.filter((vote) => voterIds.has(vote.voterId));

  return {
    round: {
      id: round.id,
      title: round.title,
      positionLabel: round.positionLabel,
      dueAt: round.dueAt.toISOString(),
      releaseAt: round.releaseAt?.toISOString() ?? null,
      roughCutUrl: playbackUrl,
      roughCutSource: roughCutSourceText(round)
    },
    config,
    viewer: { userId: viewer.userId, canManage: viewer.canManage, isVoter: voterIds.has(viewer.userId) },
    application: {
      id: application.id,
      name: applicantName(application),
      email: application.user?.email ?? null,
      isMock: application.isMock,
      status: application.status,
      submittedAt: application.submittedAt?.toISOString() ?? null,
      version: application.version,
      answers: parseAnswers(application.answers),
      extensionUntil: application.extensionUntil?.toISOString() ?? null,
      extensionNote: application.extensionNote,
      decisionKey: application.decisionKey,
      decisionMessage: application.decisionMessage
    },
    notes: application.notes.map((note) => ({
      id: note.id,
      kind: note.kind,
      text: note.text,
      createdAt: note.createdAt.toISOString(),
      authorId: note.authorId,
      author: note.author.name?.trim() || note.author.email || "Producer"
    })),
    votes: {
      voters,
      byVoter: Object.fromEntries(votes.map((vote) => [vote.voterId, vote.optionKey])),
      tally: tallyVotes(votes.map((vote) => vote.optionKey), voters.length)
    },
    ai: (() => {
      const read = parseAiRead(application.aiRead);
      return read ? { ...read, readAt: application.aiReadAt?.toISOString() ?? null, standing } : null;
    })()
  };
}

export type ApplicationDetail = Awaited<ReturnType<typeof getApplicationDetail>>;

async function applicationInRound(applicationId: string) {
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { round: true } });
  if (!application) throw new Error("NOT_FOUND");
  return application;
}

export async function addNote(viewer: ApplicationsViewer, applicationId: string, kind: "NOTE" | "INTERVIEW", text: string) {
  await applicationInRound(applicationId);
  return prisma.applicationReviewNote.create({ data: { applicationId, authorId: viewer.userId, kind, text: text.trim() } });
}

export async function deleteNote(viewer: ApplicationsViewer, noteId: string) {
  const note = await prisma.applicationReviewNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("NOT_FOUND");
  if (note.authorId !== viewer.userId && !viewer.canManage) throw new Error("FORBIDDEN");
  await prisma.applicationReviewNote.delete({ where: { id: noteId } });
}

export async function saveRanking(
  viewer: ApplicationsViewer,
  roundId: string,
  input: { order: string[]; reasons: Record<string, string>; submit: boolean }
) {
  await getRoundOrThrow(roundId);
  const pool = await prisma.application.findMany({ where: { roundId, status: "SUBMITTED" }, select: { id: true } });
  const ids = pool.map((row) => row.id);
  const order = normalizeOrder(input.order, ids);
  const reasons = Object.fromEntries(Object.entries(input.reasons).filter(([id, reason]) => ids.includes(id) && reason.trim()));
  const existing = await prisma.applicationRanking.findUnique({ where: { roundId_reviewerId: { roundId, reviewerId: viewer.userId } } });
  const submittedAt = input.submit ? (existing?.submittedAt ?? new Date()) : (existing?.submittedAt ?? null);
  const data = { order: order as Prisma.InputJsonValue, reasons: reasons as Prisma.InputJsonValue, submittedAt };
  await prisma.applicationRanking.upsert({
    where: { roundId_reviewerId: { roundId, reviewerId: viewer.userId } },
    create: { roundId, reviewerId: viewer.userId, ...data },
    update: data
  });
}

export async function castVote(viewer: ApplicationsViewer, applicationId: string, optionKey: string | null) {
  const application = await applicationInRound(applicationId);
  const voters = await listVoters();
  if (!voters.some((voter) => voter.id === viewer.userId)) throw new Error("FORBIDDEN");
  if (application.round.releaseAt) throw new Error("Votes are locked while a release is set. Cancel the release to change them.");
  if (application.status !== "SUBMITTED") throw new Error("Only submitted applications get a decision.");
  if (optionKey === null) {
    await prisma.applicationVote.deleteMany({ where: { applicationId, voterId: viewer.userId } });
    return;
  }
  const config = parseApplicationConfig(application.round.config);
  if (!config.decisions.some((decision) => decision.key === optionKey)) throw new Error("BAD_REQUEST");
  await prisma.applicationVote.upsert({
    where: { applicationId_voterId: { applicationId, voterId: viewer.userId } },
    create: { applicationId, voterId: viewer.userId, optionKey },
    update: { optionKey }
  });
}

/**
 * Freeze every submitted applicant's majority decision and set when applicants see it. Blocked while
 * any real (non-mock) submitted applicant has no majority. Cancelling un-releases and unlocks votes.
 */
export async function setRelease(viewer: ApplicationsViewer, roundId: string, releaseAt: Date | null) {
  const round = await getRoundOrThrow(roundId);
  if (releaseAt === null) {
    await prisma.$transaction([
      prisma.application.updateMany({ where: { roundId }, data: { decisionKey: null } }),
      prisma.applicationRound.update({ where: { id: roundId }, data: { releaseAt: null } })
    ]);
    await audit(roundId, null, viewer.userId, "release.cancel");
    return;
  }
  const [applications, voters] = await Promise.all([loadPool(roundId), listVoters()]);
  const voterIds = new Set(voters.map((voter) => voter.id));
  const submitted = applications.filter((application) => application.status === "SUBMITTED");
  const winners = submitted.map((application) => ({
    application,
    winner: tallyVotes(
      application.votes.filter((vote) => voterIds.has(vote.voterId)).map((vote) => vote.optionKey),
      voters.length
    ).winner
  }));
  const undecided = winners.filter((entry) => !entry.winner && !entry.application.isMock);
  if (undecided.length) {
    const names = undecided.slice(0, 3).map((entry) => applicantName(entry.application)).join(", ");
    throw new Error(`No majority yet for ${undecided.length} applicant${undecided.length === 1 ? "" : "s"} (${names}${undecided.length > 3 ? ", …" : ""}).`);
  }
  await prisma.$transaction([
    ...winners.map(({ application, winner }) =>
      prisma.application.update({ where: { id: application.id }, data: { decisionKey: winner } })
    ),
    prisma.applicationRound.update({ where: { id: round.id }, data: { releaseAt } })
  ]);
  await audit(roundId, null, viewer.userId, "release.set", { releaseAt: releaseAt.toISOString() });
}

export async function updateApplicationMeta(
  viewer: ApplicationsViewer,
  applicationId: string,
  input: { extensionUntil?: string | null; extensionNote?: string | null; decisionMessage?: string | null }
) {
  const application = await applicationInRound(applicationId);
  const data: Prisma.ApplicationUpdateInput = {};
  if (input.extensionUntil !== undefined) {
    data.extensionUntil = input.extensionUntil ? new Date(input.extensionUntil) : null;
    data.extensionNote = input.extensionNote?.trim() || null;
  }
  if (input.decisionMessage !== undefined) data.decisionMessage = input.decisionMessage?.trim() || null;
  await prisma.application.update({ where: { id: applicationId }, data });
  if (input.extensionUntil !== undefined) {
    await audit(application.roundId, applicationId, viewer.userId, "application.extension", {
      until: input.extensionUntil ?? null,
      note: input.extensionNote ?? null
    });
  }
}

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  // Spreadsheets run cells that start with these as formulas; a leading ' keeps them as text.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The comparison table as CSV (reviewers). Notes, reasons and answers stay out of the file. */
export async function exportRoundCsv(viewer: ApplicationsViewer, roundId: string) {
  const overview = await getRoundOverview(viewer, roundId);
  const pool = await prisma.application.findMany({ where: { roundId }, select: { id: true, aiRead: true } });
  const reads = new Map(pool.map((row) => [row.id, parseAiRead(row.aiRead)]));
  const header = [
    "Name",
    "Mock",
    "Status",
    "Submitted",
    "Grade",
    "Top role",
    "Average rank",
    "Rankings",
    ...overview.rubric.map((criterion) => `AI ${criterion.label}`),
    "AI total",
    "AI place",
    "Leading decision",
    "Votes"
  ];
  const label = (key: string | null) => overview.decisions.find((decision) => decision.key === key)?.label ?? "";
  const rows = overview.applications.map((application) => {
    const read = reads.get(application.id);
    return [
      application.name,
      application.isMock ? "yes" : "",
      application.status,
      application.submittedAt ?? "",
      application.grade,
      application.topRole,
      application.averageRank?.toFixed(2) ?? "",
      application.rankCount,
      ...overview.rubric.map((criterion) => read?.scores[criterion.key]?.score ?? ""),
      application.ai?.total ?? "",
      application.ai ? `${application.ai.place} of ${application.ai.of}` : "",
      label(application.tally.winner),
      `${application.tally.cast}/${overview.voters.length}`
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
