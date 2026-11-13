import type { Application, ApplicationRound, Prisma } from "@prisma/client";
import { answersSchema, cleanAnswers, parseAnswers, validateForSubmit } from "@/src/lib/applications/answers";
import { applicantConfig, parseApplicationConfig } from "@/src/lib/applications/config";
import { isReleased, windowState } from "@/src/lib/applications/desk";
import { prisma } from "@/src/lib/prisma";
import type { ApplicationsViewer } from "@/src/server/applications/access";
import { applicantRound, audit, getRoundOrThrow } from "@/src/server/applications/rounds";

/**
 * The applicant side. An applicant only ever reads their own application. Reviewers who open the
 * form get a test application (isMock) that ignores the window, so they can try it before it opens.
 */

function visibleToApplicants(round: ApplicationRound, now = new Date()) {
  return round.status !== "DRAFT" && (!round.opensAt || round.opensAt <= now);
}

function editWindow(viewer: ApplicationsViewer, round: ApplicationRound, application: Application | null) {
  const window = viewer.isReviewer
    ? { opened: true, deadline: round.dueAt, beforeDeadline: true, canEdit: true }
    : windowState({ status: round.status, opensAt: round.opensAt, dueAt: round.dueAt, extensionUntil: application?.extensionUntil });
  // Once a release is set, decisions are frozen, so nobody can change or add an application.
  return round.releaseAt ? { ...window, canEdit: false } : window;
}

/** The applicant's own decision, only once released. */
function releasedDecision(round: ApplicationRound, application: Application) {
  if (application.isMock && !application.userId) return null;
  if (!isReleased(round.releaseAt) || !application.decisionKey || application.status !== "SUBMITTED") return null;
  const option = parseApplicationConfig(round.config).decisions.find((decision) => decision.key === application.decisionKey);
  if (!option) return null;
  return { label: option.label, message: application.decisionMessage?.trim() || option.message, tone: option.tone };
}

export async function getApplicantHome(viewer: ApplicationsViewer) {
  const [rounds, mine] = await Promise.all([
    prisma.applicationRound.findMany({ where: { status: { not: "DRAFT" } }, orderBy: { dueAt: "desc" } }),
    prisma.application.findMany({ where: { userId: viewer.userId }, include: { round: true } })
  ]);
  const byRound = new Map(mine.map((application) => [application.roundId, application]));
  const shown = new Map<string, ApplicationRound>();
  for (const round of rounds) if (visibleToApplicants(round) && round.status === "PUBLISHED") shown.set(round.id, round);
  // Reviewers also see hidden drafts here, so they can preview the student form before publishing.
  if (viewer.isReviewer) {
    const drafts = await prisma.applicationRound.findMany({ where: { status: "DRAFT" }, orderBy: { dueAt: "desc" } });
    for (const round of drafts) shown.set(round.id, round);
  }
  for (const application of mine) if (application.round.status !== "DRAFT" || viewer.isReviewer) shown.set(application.roundId, application.round);

  return [...shown.values()].map((round) => {
    const application = byRound.get(round.id) ?? null;
    const window = editWindow(viewer, round, application);
    return {
      id: round.id,
      title: round.title,
      positionLabel: round.positionLabel,
      dueAt: (application?.extensionUntil && application.extensionUntil > round.dueAt ? application.extensionUntil : round.dueAt).toISOString(),
      canEdit: window.canEdit,
      status: application?.status ?? null,
      submittedAt: application?.submittedAt?.toISOString() ?? null,
      decision: application ? releasedDecision(round, application) : null
    };
  });
}

export async function getMyApplication(viewer: ApplicationsViewer, roundId: string) {
  const round = await getRoundOrThrow(roundId);
  const application = await prisma.application.findUnique({ where: { roundId_userId: { roundId, userId: viewer.userId } } });
  if (!viewer.isReviewer && !application && !(visibleToApplicants(round) && round.status === "PUBLISHED")) {
    throw new Error("NOT_FOUND");
  }
  const window = editWindow(viewer, round, application);
  return {
    round: applicantRound(round),
    preview: viewer.isReviewer,
    applicantName: viewer.name,
    window: { canEdit: window.canEdit, deadline: window.deadline.toISOString(), opened: window.opened },
    application: application
      ? {
          status: application.status,
          answers: parseAnswers(application.answers),
          attested: application.attested,
          submittedAt: application.submittedAt?.toISOString() ?? null,
          version: application.version,
          updatedAt: application.updatedAt.toISOString()
        }
      : null,
    decision: application ? releasedDecision(round, application) : null
  };
}

export type MyApplicationView = Awaited<ReturnType<typeof getMyApplication>>;

async function loadForEdit(viewer: ApplicationsViewer, roundId: string) {
  const round = await getRoundOrThrow(roundId);
  const application = await prisma.application.findUnique({ where: { roundId_userId: { roundId, userId: viewer.userId } } });
  if (!viewer.isReviewer && !application && !visibleToApplicants(round)) throw new Error("NOT_FOUND");
  const window = { ...editWindow(viewer, round, application), released: Boolean(round.releaseAt) };
  return { round, application, window };
}

function cannotEdit(window: { opened: boolean; deadline: Date; released: boolean }) {
  if (window.released) return "Decisions for this round are set, so applications are locked.";
  return window.opened ? closedMessage(window.deadline) : "This application isn't open yet.";
}

function closedMessage(deadline: Date) {
  const when = deadline.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `Applications closed on ${when} (Pacific).`;
}

export async function saveDraft(viewer: ApplicationsViewer, roundId: string, input: { answers?: unknown; attested: boolean }) {
  const { round, application, window } = await loadForEdit(viewer, roundId);
  if (!window.canEdit) throw new Error(cannotEdit(window));
  if (application?.status === "SUBMITTED") throw new Error("Your application is submitted. Unsubmit it to make changes.");
  const answers = answersSchema.parse(input.answers);
  const data = { answers: answers as unknown as Prisma.InputJsonValue, attested: input.attested };
  if (!application) {
    const created = await prisma.application.create({
      data: { roundId: round.id, userId: viewer.userId, isMock: viewer.isReviewer, ...data },
      select: { updatedAt: true }
    });
    return { updatedAt: created.updatedAt.toISOString() };
  }
  // Only ever overwrite a draft: a late autosave from another tab must not touch a submitted copy.
  const { count } = await prisma.application.updateMany({ where: { id: application.id, status: "DRAFT" }, data });
  if (count === 0) throw new Error("Your application is submitted. Unsubmit it to make changes.");
  return { updatedAt: new Date().toISOString() };
}

export async function submitApplication(viewer: ApplicationsViewer, roundId: string, input: { answers?: unknown; attested: boolean }) {
  const { round, application, window } = await loadForEdit(viewer, roundId);
  if (!window.canEdit) throw new Error(cannotEdit(window));
  if (application?.status === "SUBMITTED") throw new Error("Your application is already submitted.");
  const answers = cleanAnswers(answersSchema.parse(input.answers));
  const problems = validateForSubmit(answers, applicantConfig(parseApplicationConfig(round.config)), input.attested);
  if (problems.length) throw new Error(problems[0]!.message);
  const data = {
    answers: answers as unknown as Prisma.InputJsonValue,
    attested: true,
    status: "SUBMITTED" as const,
    submittedAt: new Date(),
    version: { increment: 1 }
  };
  let saved;
  if (application) {
    const { count } = await prisma.application.updateMany({ where: { id: application.id, status: "DRAFT" }, data });
    if (count === 0) throw new Error("Your application is already submitted.");
    saved = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
  } else {
    saved = await prisma.application.create({ data: { roundId: round.id, userId: viewer.userId, isMock: viewer.isReviewer, ...data, version: 1 } });
  }
  await audit(round.id, saved.id, viewer.userId, "application.submit", { version: saved.version });
  return { submittedAt: saved.submittedAt?.toISOString() ?? null, version: saved.version };
}

export async function unsubmitApplication(viewer: ApplicationsViewer, roundId: string) {
  const { round, application, window } = await loadForEdit(viewer, roundId);
  if (!application || application.status !== "SUBMITTED") throw new Error("There's no submitted application to unsubmit.");
  if (!round.allowUnsubmit && !viewer.isReviewer) throw new Error("This application can't be unsubmitted.");
  if (!window.canEdit) throw new Error(closedMessage(window.deadline));
  if (round.releaseAt) throw new Error("Decisions are already set for release.");
  await prisma.application.update({ where: { id: application.id }, data: { status: "DRAFT" } });
  await audit(round.id, application.id, viewer.userId, "application.unsubmit", { version: application.version });
}
