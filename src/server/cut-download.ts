import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-roles";
import { prisma } from "@/src/lib/prisma";
import { ARollDownloadError, resolveClipDownloadUrl } from "@/src/server/a-roll-download";

/**
 * A signed URL that saves one version of a package's Initial Cut or Final Cut as a file. Open to
 * the package's members and producers, the same people who can open its stages; any version of
 * the cut that is still stored and ready (older Initial Cut versions included).
 */
export async function resolveCutDownloadUrl(input: {
  userId: string;
  role: PlatformRole | null;
  rowId: string;
  versionId: string;
}): Promise<string> {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.rowId },
    select: {
      initialCutMediaItemId: true,
      finalCutMediaItemId: true,
      members: { select: { userId: true } }
    }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const isMember = row.members.some((member) => member.userId === input.userId);
  if (!isMember && !hasPlatformRole(input.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }

  const version = await prisma.mediaVersion.findUnique({
    where: { id: input.versionId },
    select: {
      id: true,
      status: true,
      bunnyVideoId: true,
      storageProvider: true,
      nasPath: true,
      storageSizeBytes: true,
      updatedAt: true,
      mediaItem: { select: { id: true, title: true, deletedAt: true } }
    }
  });
  const cutIds = [row.initialCutMediaItemId, row.finalCutMediaItemId].filter(Boolean);
  if (!version || version.mediaItem.deletedAt || !cutIds.includes(version.mediaItem.id)) {
    throw new ARollDownloadError("That version is no longer stored.", 404);
  }
  if (version.status !== "READY") {
    throw new ARollDownloadError("That version is not ready to download yet.", 409);
  }

  const { mediaItem, ...file } = version;
  return resolveClipDownloadUrl({ id: mediaItem.id, title: mediaItem.title, folder: "Cut", version: file });
}
