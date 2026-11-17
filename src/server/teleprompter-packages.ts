import { finalCutHeadline } from "@/src/lib/package-headline";
import { type ShowPackageToss, fillPackageTosses } from "@/src/lib/teleprompter-package-toss";
import { A4_TEMPLATE, renderA3Content } from "@/src/lib/teleprompter-template";
import { THANK_YOU_PLACEHOLDER, fillThankYouNames, reporterFirstName } from "@/src/lib/teleprompter-thank-you";
import { prisma } from "@/src/lib/prisma";

function loadQueuedShowPackages(showDate: Date) {
  return prisma.packageProgressRow.findMany({
    where: { queuedForAirAt: { not: null }, queuedForShowDate: showDate.toISOString().slice(0, 10) },
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
}

function toShowPackageToss(row: Awaited<ReturnType<typeof loadQueuedShowPackages>>[number]): ShowPackageToss {
  return {
    title: finalCutHeadline(row.finalCutMediaItem) ?? (row.groupTopic.trim() || "Untitled package"),
    toss: row.finalCutToss
  };
}

/**
 * Rebuilds the A3 package section from scratch with the tosses of the packages
 * queued for the show now. Used by the section's Refetch action after the queue
 * changes; unlike the automatic sync, it replaces whatever A3 held.
 */
export async function buildPackageSectionContent(showDate: Date) {
  const rows = await loadQueuedShowPackages(showDate);
  return fillPackageTosses(renderA3Content(), rows.map(toShowPackageToss));
}

/** First names of the queued packages' reporters, each person once. */
function reporterFirstNames(rows: Awaited<ReturnType<typeof loadQueuedShowPackages>>) {
  const reporters = new Map(rows.flatMap((row) => row.members).map((member) => [member.userId, member.user]));
  return [...reporters.values()].map(reporterFirstName);
}

/** Rebuilds the A4 thank-you from scratch with the reporters of the packages queued now. */
export async function buildThankYouSectionContent(showDate: Date) {
  return fillThankYouNames(A4_TEMPLATE, reporterFirstNames(await loadQueuedShowPackages(showDate)));
}

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

  const rows = await loadQueuedShowPackages(params.showDate);

  const updates: { id: string; from: string; to: string }[] = [];
  if (a3) {
    const content = fillPackageTosses(a3.content, rows.map(toShowPackageToss));
    updates.push({ id: a3.id, from: a3.content, to: content });
  }
  if (a4) {
    const content = fillThankYouNames(a4.content, reporterFirstNames(rows));
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
