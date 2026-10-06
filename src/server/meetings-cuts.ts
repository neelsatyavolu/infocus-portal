import type { Prisma } from "@prisma/client";
import { resolvePlaybackUrl } from "@/src/lib/media-playback";
import type { MeetingCut, MeetingCutCatalog, MeetingCutGroup, MeetingCutKind, MeetingCutVersion } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

/**
 * Watch together: every group's Initial and Final Cut versions, by cycle. Meetings are
 * producers only, and any producer may play any cycle cut (resolveCycleMediaAccess), so the
 * catalog lists every group. Only finished videos are listed.
 */

const playableVersions = {
  where: { status: "READY", sourceType: "VIDEO" },
  orderBy: { versionNumber: "asc" },
  select: { id: true, versionNumber: true, durationSeconds: true, approvalStatus: true, createdAt: true }
} satisfies Prisma.MediaItem$versionsArgs;

const cutItemSelect = { id: true, deletedAt: true, versions: playableVersions } satisfies Prisma.MediaItemSelect;

type CutItem = Prisma.MediaItemGetPayload<{ select: typeof cutItemSelect }>;

/** Rows that have at least one cut item (custom publishing-queue packages are cycle 0: skipped). */
const hasCutWhere = {
  cycleNumber: { gt: 0 },
  OR: [{ initialCutMediaItemId: { not: null } }, { finalCutMediaItemId: { not: null } }]
} satisfies Prisma.PackageProgressRowWhereInput;

export function cutLabel(kind: MeetingCutKind, versionNumber: number) {
  return `${kind === "initial" ? "Initial Cut" : "Final Cut"} v${versionNumber}`;
}

function toVersions(item: CutItem | null): MeetingCutVersion[] {
  if (!item || item.deletedAt) return [];
  return item.versions.map((version) => ({
    versionId: version.id,
    mediaId: item.id,
    versionNumber: version.versionNumber,
    durationSeconds: version.durationSeconds,
    approved: version.approvalStatus === "APPROVED" || version.approvalStatus === "AIRED",
    uploadedAt: version.createdAt.toISOString()
  }));
}

function groupTopic(topic: string) {
  return topic.trim() || "Untitled package";
}

export async function listMeetingCuts(requestedCycle?: number): Promise<MeetingCutCatalog> {
  const cycleRows = await prisma.packageProgressRow.findMany({
    where: hasCutWhere,
    distinct: ["cycleNumber"],
    select: { cycleNumber: true },
    orderBy: { cycleNumber: "desc" }
  });
  const cycles = cycleRows.map((row) => row.cycleNumber);
  const cycle = requestedCycle !== undefined && cycles.includes(requestedCycle) ? requestedCycle : (cycles[0] ?? null);
  if (cycle === null) return { cycles, cycle, groups: [] };

  const rows = await prisma.packageProgressRow.findMany({
    where: { ...hasCutWhere, cycleNumber: cycle },
    orderBy: { rowOrder: "asc" },
    select: {
      id: true,
      groupTopic: true,
      members: { orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, nickname: true, email: true } } } },
      initialCutMediaItem: { select: cutItemSelect },
      finalCutMediaItem: { select: cutItemSelect }
    }
  });

  const groups: MeetingCutGroup[] = rows
    .map((row) => ({
      rowId: row.id,
      topic: groupTopic(row.groupTopic),
      members: row.members.map((member) => userDisplayName(member.user)).filter(Boolean),
      initial: toVersions(row.initialCutMediaItem),
      final: toVersions(row.finalCutMediaItem)
    }))
    .filter((group) => group.initial.length > 0 || group.final.length > 0);
  return { cycles, cycle, groups };
}

/**
 * One cut version to play, with a fresh playback URL. Only versions of a group's Initial or
 * Final Cut item: never arbitrary media (the room passes ids from any participant).
 */
export async function getMeetingCut(versionId: string): Promise<MeetingCut> {
  const version = await prisma.mediaVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      versionNumber: true,
      durationSeconds: true,
      status: true,
      sourceType: true,
      bunnyVideoId: true,
      storageProvider: true,
      nasPath: true,
      mediaItem: { select: { id: true, deletedAt: true } }
    }
  });
  if (!version || version.status !== "READY" || version.sourceType !== "VIDEO" || version.mediaItem.deletedAt) {
    throw new Error("NOT_FOUND");
  }
  const mediaId = version.mediaItem.id;
  const row = await prisma.packageProgressRow.findFirst({
    where: { cycleNumber: { gt: 0 }, OR: [{ initialCutMediaItemId: mediaId }, { finalCutMediaItemId: mediaId }] },
    select: { cycleNumber: true, groupTopic: true, initialCutMediaItemId: true }
  });
  if (!row) throw new Error("NOT_FOUND");

  const playbackUrl = await resolvePlaybackUrl(version);
  if (!playbackUrl) throw new Error("NOT_FOUND");
  const kind: MeetingCutKind = row.initialCutMediaItemId === mediaId ? "initial" : "final";
  return {
    versionId: version.id,
    mediaId,
    kind,
    versionNumber: version.versionNumber,
    cycleNumber: row.cycleNumber,
    topic: groupTopic(row.groupTopic),
    label: cutLabel(kind, version.versionNumber),
    durationSeconds: version.durationSeconds,
    playbackUrl
  };
}
