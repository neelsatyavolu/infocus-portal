import { finalCutHeadline } from "@/src/lib/package-headline";
import { fillPackageTosses } from "@/src/lib/teleprompter-package-toss";
import { prisma } from "@/src/lib/prisma";

/** Fills the show doc's A3 package tosses from the packages queued for that show. */
export async function syncTeleprompterPackageTosses(params: { workspaceId: string; showDate: Date }) {
  const section = await prisma.teleprompterSection.findFirst({
    where: { label: "A3", doc: { workspaceId: params.workspaceId, showDate: params.showDate } },
    select: { id: true, content: true }
  });
  if (!section || !section.content.includes("[INSERT PACKAGE TOSS")) return;

  const rows = await prisma.packageProgressRow.findMany({
    where: { queuedForAirAt: { not: null }, queuedForShowDate: params.showDate.toISOString().slice(0, 10) },
    orderBy: { queuedForAirAt: "asc" },
    select: {
      groupTopic: true,
      finalCutToss: true,
      finalCutMediaItem: { select: { title: true, currentVersion: { select: { nasPath: true } } } }
    }
  });
  const content = fillPackageTosses(
    section.content,
    rows.map((row) => ({
      title: finalCutHeadline(row.finalCutMediaItem) ?? (row.groupTopic.trim() || "Untitled package"),
      toss: row.finalCutToss
    }))
  );
  if (content === section.content) return;
  // A concurrent producer edit wins.
  await prisma.teleprompterSection.updateMany({
    where: { id: section.id, content: section.content },
    data: { content }
  });
}
