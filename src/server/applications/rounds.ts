import type { ApplicationRound, Prisma } from "@prisma/client";
import { z } from "zod";
import { applicantConfig, applicationConfigSchema, DEFAULT_APPLICATION_CONFIG, parseApplicationConfig } from "@/src/lib/applications/config";
import { resolvePlaybackUrl } from "@/src/lib/media-playback";
import { nasDeriveWebPlaybackUrl, nasMintDownloadUrl } from "@/src/lib/nas-storage";
import { parseDriveSource, storedNasPath, toStoredNasUrl } from "@/src/lib/applications/rough-cut";
import { prisma } from "@/src/lib/prisma";
import type { ApplicationsViewer } from "@/src/server/applications/access";

/** Round settings form (managers). Dates arrive as ISO strings. */
export const roundSettingsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  positionLabel: z.string().trim().min(1).max(120),
  intro: z.string().trim().max(4000),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]),
  opensAt: z.string().datetime({ offset: true }).nullable(),
  dueAt: z.string().datetime({ offset: true }),
  allowUnsubmit: z.boolean(),
  roughCutSource: z.string().trim().max(500),
  config: applicationConfigSchema,
  /** The round's updatedAt when the form loaded; a newer save in between makes this one stale. */
  loadedUpdatedAt: z.string().datetime({ offset: true })
});

export type RoundSettingsInput = z.infer<typeof roundSettingsSchema>;

export async function listRounds() {
  const rounds = await prisma.applicationRound.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { applications: { where: { status: "SUBMITTED", isMock: false } } } } }
  });
  return rounds.map((round) => ({
    id: round.id,
    title: round.title,
    positionLabel: round.positionLabel,
    status: round.status,
    opensAt: round.opensAt,
    dueAt: round.dueAt,
    releaseAt: round.releaseAt,
    submitted: round._count.applications
  }));
}

export async function getRoundOrThrow(roundId: string) {
  const round = await prisma.applicationRound.findUnique({ where: { id: roundId } });
  if (!round) throw new Error("NOT_FOUND");
  return round;
}

/** The new round starts as a hidden draft with this year's template, due Feb 28, 2027 at 11:59 PM Pacific. */
export async function createRound(viewer: ApplicationsViewer, title: string) {
  const round = await prisma.applicationRound.create({
    data: {
      title: title.trim() || "Producer Application",
      positionLabel: "Executive Producer",
      intro:
        "Anyone who applies is applying for Executive Producer. If you aren't selected as an Executive Producer, we'll automatically consider you for Associate Producer.",
      dueAt: new Date("2027-03-01T07:59:00.000Z"),
      config: DEFAULT_APPLICATION_CONFIG as unknown as Prisma.InputJsonValue,
      createdById: viewer.userId
    }
  });
  await audit(round.id, null, viewer.userId, "round.create");
  return round;
}

export async function updateRound(viewer: ApplicationsViewer, roundId: string, input: RoundSettingsInput) {
  const current = await getRoundOrThrow(roundId);
  if (current.updatedAt.toISOString() !== new Date(input.loadedUpdatedAt).toISOString()) {
    throw new Error("These settings changed since you opened this page (someone else saved, or another tab). Reload the page, then make your change again.");
  }
  const rough = await resolveRoughCutSource(input.roughCutSource);
  const round = await prisma.applicationRound.update({
    where: { id: roundId },
    data: {
      title: input.title,
      positionLabel: input.positionLabel,
      intro: input.intro,
      status: input.status,
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      dueAt: new Date(input.dueAt),
      allowUnsubmit: input.allowUnsubmit,
      roughCutMediaItemId: rough.mediaItemId,
      roughCutUrl: rough.url,
      config: input.config as unknown as Prisma.InputJsonValue
    }
  });
  await audit(roundId, null, viewer.userId, "round.update", { status: input.status, dueAt: input.dueAt });
  return round;
}

/**
 * The rough cut is a Portal media item (pasted as a link or id; played through a short-lived signed
 * Drive URL) or a direct https video URL.
 */
async function resolveRoughCutSource(source: string): Promise<{ mediaItemId: string | null; url: string | null }> {
  if (!source) return { mediaItemId: null, url: null };
  const drivePath = parseDriveSource(source);
  if (drivePath) return { mediaItemId: null, url: toStoredNasUrl(drivePath) };
  const candidates = source.match(/[a-z0-9]{20,32}/gi) ?? [];
  if (candidates.length) {
    const item = await prisma.mediaItem.findFirst({ where: { id: { in: candidates }, deletedAt: null }, select: { id: true } });
    if (item) return { mediaItemId: item.id, url: null };
  }
  if (/^https:\/\/\S+$/i.test(source)) return { mediaItemId: null, url: source };
  throw new Error('That rough cut isn\'t a Portal video link, a "drive:Package Storage/…" path or an https video URL.');
}

/** A playable URL for the round's rough cut, for a signed-in viewer only (callers check access). */
export async function roughCutPlayback(round: Pick<ApplicationRound, "roughCutMediaItemId" | "roughCutUrl">) {
  const nasPath = storedNasPath(round.roughCutUrl);
  if (nasPath) return nasDeriveWebPlaybackUrl(await nasMintDownloadUrl(nasPath, 60 * 60));
  if (round.roughCutUrl) return round.roughCutUrl;
  if (!round.roughCutMediaItemId) return null;
  const item = await prisma.mediaItem.findUnique({
    where: { id: round.roughCutMediaItemId },
    select: {
      deletedAt: true,
      currentVersion: { select: { bunnyVideoId: true, storageProvider: true, nasPath: true, sourceType: true, status: true } }
    }
  });
  const version = item && !item.deletedAt ? item.currentVersion : null;
  if (!version || version.status !== "READY") return null;
  return resolvePlaybackUrl(version);
}

/** The settings form's text for the rough-cut field. */
export function roughCutSourceText(round: Pick<ApplicationRound, "roughCutMediaItemId" | "roughCutUrl">) {
  const nasPath = storedNasPath(round.roughCutUrl);
  if (nasPath) return `drive:${nasPath}`;
  return round.roughCutUrl ?? round.roughCutMediaItemId ?? "";
}

/** A round as an applicant may see it (no answer key, rubric or decision internals). */
export function applicantRound(round: ApplicationRound) {
  return {
    id: round.id,
    title: round.title,
    positionLabel: round.positionLabel,
    intro: round.intro,
    status: round.status,
    opensAt: round.opensAt?.toISOString() ?? null,
    dueAt: round.dueAt.toISOString(),
    allowUnsubmit: round.allowUnsubmit,
    hasRoughCut: Boolean(round.roughCutMediaItemId || round.roughCutUrl),
    config: applicantConfig(parseApplicationConfig(round.config))
  };
}

export type ApplicantRound = ReturnType<typeof applicantRound>;

export async function audit(roundId: string, applicationId: string | null, actorId: string | null, action: string, detail?: Prisma.InputJsonValue) {
  await prisma.applicationAudit.create({ data: { roundId, applicationId, actorId, action, detail } });
}
