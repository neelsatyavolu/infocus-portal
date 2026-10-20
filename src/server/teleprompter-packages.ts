import { finalCutHeadline } from "@/src/lib/package-headline";
import { fillPackageTosses } from "@/src/lib/teleprompter-package-toss";
import { THANK_YOU_PLACEHOLDER, fillThankYouNames, reporterFirstName } from "@/src/lib/teleprompter-thank-you";
import { prisma } from "@/src/lib/prisma";

/**
 * Fills the show doc's A3 package tosses and A4 reporter thank-you from the
 * packages queued for that show.
 */
export async function syncTeleprompterPackageTosses(params: { workspaceId: string; showDate: Date }) {
  const sections = await prisma.teleprompterSection.findMany({
    where: { label: { in: ["A3", "A4"] }, doc: { workspaceId: params.workspaceId, showDate: params.showDate } },
    select: { id: true, label: true, content: true }
  });
  const a3 = sections.find((section) => section.label === "A3" && section.content.includes("[INSERT PACKAGE TOSS"));
  const a4 = sections.find((section) => section.label === "A4" && section.content.includes(THANK_YOU_PLACEHOLDER));
  if (!a3 && !a4) return;

  const rows = await prisma.packageProgressRow.findMany({
    where: { queuedForAirAt: { not: null }, queuedForShowDate: params.showDate.toISOString().slice(0, 10) },
    orderBy: { queuedForAirAt: "asc" },
    select: {
      groupTopic: true,
      finalCutToss: true,
      finalCutMediaItem: { select: { title: true, currentVersion: { select: { nasPath: true } } } },
      members: {
        orderBy: { createdAt: "asc" },
        select: { userId: true, user: { select: { name: true, nickname: true } } }
      }
    }
  });

  const updates: { id: string; from: string; to: string }[] = [];
  if (a3) {
    const content = fillPackageTosses(
      a3.content,
      rows.map((row) => ({
        title: finalCutHeadline(row.finalCutMediaItem) ?? (row.groupTopic.trim() || "Untitled package"),
        toss: row.finalCutToss
      }))
    );
    updates.push({ id: a3.id, from: a3.content, to: content });
  }
  if (a4) {
    const reporters = new Map(rows.flatMap((row) => row.members).map((member) => [member.userId, member.user]));
    const content = fillThankYouNames(a4.content, [...reporters.values()].map(reporterFirstName));
    updates.push({ id: a4.id, from: a4.content, to: content });
  }

  for (const update of updates) {
    if (update.to === update.from) continue;
    // A concurrent producer edit wins.
    await prisma.teleprompterSection.updateMany({
      where: { id: update.id, content: update.from },
      data: { content: update.to }
    });
  }
}
