import { prisma } from "@/src/lib/prisma";
import {
  extractAnchorNamesFromCalendarHtml,
  resolveAnchorDisplayNames,
  refreshAnchorScriptNames
} from "@/src/lib/teleprompter-anchor-names";

export async function resolveAnchorAssignments(params: { workspaceId: string; showDate: Date }) {
  const { showDate } = params;
  const [calendarEntry, members] = await Promise.all([
    prisma.masterCalendarEntry.findUnique({
      where: {
        date: showDate.toISOString().slice(0, 10)
      },
      select: {
        content: true
      }
    }),
    // Calendar cast comes from registered users, not workspace membership.
    prisma.user.findMany({ select: { name: true, nickname: true } })
  ]);

  const rawNames = calendarEntry ? extractAnchorNamesFromCalendarHtml(calendarEntry.content) : [];
  const resolvedNames = resolveAnchorDisplayNames(
    rawNames,
    members
  );

  return {
    anchorName: resolvedNames[0] ?? null,
    coanchorName: resolvedNames[1] ?? null
  };
}


export async function syncTeleprompterAnchorNames(params: { workspaceId?: string; dateKey?: string }) {
  const docs = await prisma.teleprompterDoc.findMany({
    where: {
      workspaceId: params.workspaceId,
      showDate: params.dateKey ? new Date(`${params.dateKey}T12:00:00.000Z`) : { not: null }
    },
    select: {
      workspaceId: true,
      showDate: true,
      sections: {
        where: { label: { in: ["A1", "A5"] } },
        select: { id: true, label: true, content: true }
      }
    }
  });
  if (docs.length === 0) return;

  const [entries, members] = await Promise.all([
    prisma.masterCalendarEntry.findMany({
      where: { date: { in: [...new Set(docs.map((doc) => doc.showDate!.toISOString().slice(0, 10)))] } },
      select: { date: true, content: true }
    }),
    prisma.user.findMany({ select: { name: true, nickname: true } })
  ]);
  const calendar = new Map(entries.map((entry) => [entry.date, entry.content]));

  for (const doc of docs) {
    const rawNames = extractAnchorNamesFromCalendarHtml(calendar.get(doc.showDate!.toISOString().slice(0, 10)) ?? "");
    const names = resolveAnchorDisplayNames(rawNames, members);
    for (const section of doc.sections) {
      const content = refreshAnchorScriptNames(section.label, section.content, names);
      if (content !== section.content) {
        // A concurrent producer edit wins; the next load can refresh its name lines.
        await prisma.teleprompterSection.updateMany({
          where: { id: section.id, content: section.content },
          data: { content }
        });
      }
    }
  }
}
