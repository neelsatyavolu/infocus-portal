import { castNameMatchesUser, type CastNameDirectory } from "@/src/lib/cast-name-directory";
import { deadlineClosesAt, finalCutClosesAt, pacificDateKey } from "@/src/lib/deadlines";
import type { IcsEvent } from "@/src/lib/ics";
import { approvedExtensionDaysFor, effectiveDeadline, type ExtensionGrant } from "@/src/lib/package-extensions";
import { cycleCheckInDates } from "@/src/lib/package-stages";
import { formatShowDateLabel } from "@/src/lib/show-assignment";

/** Pure event builders for the personal calendar feed (src/server/calendar-feed.ts loads the rows). */

const HOUR_MS = 60 * 60 * 1000;
/** Livestream events have no stored end; the feed blocks two hours from the start. */
const LIVESTREAM_BLOCK_MS = 2 * HOUR_MS;

const pacificTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit"
});

export type FeedCycle = {
  cycleNumber: number;
  pitchingDate: Date | null;
  proofOfContactDate: Date | null;
  aRollBRollDate: Date | null;
  initialCutDate: Date | null;
  finalCutDate: Date | null;
};

export type FeedPackageRow = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  extension: boolean;
  extensionRequests: ExtensionGrant[];
};

export type FeedShowDay = {
  date: string;
  /** Anchors after the usual precedence (Master Calendar first, then the generator's stored pair). */
  anchors: string[];
  paAnnouncers: string[];
  /** Crew role → name, from the Show Roles generator. */
  assignments: Record<string, string>;
};

export type FeedLivestream = {
  id: string;
  title: string;
  startsAt: Date;
  arrivesAt: Date | null;
  location: string;
  pending: boolean;
};

export function packageDeadlineEvents(
  userId: string,
  rows: FeedPackageRow[],
  cycles: ReadonlyMap<number, FeedCycle>,
  origin: string
): IcsEvent[] {
  return rows.flatMap((row) => {
    const cycle = cycles.get(row.cycleNumber);
    if (!cycle) return [];
    const extensionDays = approvedExtensionDaysFor(row, userId);
    const checkIns = cycleCheckInDates(cycle, extensionDays);
    const finalCutDue = effectiveDeadline(cycle.finalCutDate, extensionDays);
    const stages: Array<[slug: string, label: string, closesAt: Date | null]> = [
      ["pitch", "Pitch", checkIns.pitching ? deadlineClosesAt(checkIns.pitching) : null],
      ["brainstorming", "Brainstorming (proof of contact)", checkIns.proofOfContact ? deadlineClosesAt(checkIns.proofOfContact) : null],
      ["a-roll", "A-roll / B-roll", checkIns.aRollBRoll ? deadlineClosesAt(checkIns.aRollBRoll) : null],
      ["initial-cut", "Initial Cut", checkIns.initialCut ? deadlineClosesAt(checkIns.initialCut) : null],
      ["final-cut", "Final Cut", finalCutDue ? finalCutClosesAt(finalCutDue) : null]
    ];
    const topic = row.groupTopic.trim();
    return stages.flatMap(([slug, label, closesAt]) => {
      if (!closesAt) return [];
      const lines = [
        `Due ${pacificTime.format(closesAt)} Pacific.`,
        ...(extensionDays > 0 ? [`Includes your approved ${extensionDays}-day extension.`] : []),
        ...(topic ? [`Package: ${topic}`] : [])
      ];
      return [{
        uid: `package-${row.id}-${slug}@infocus-portal`,
        summary: `Cycle ${row.cycleNumber} ${label} due`,
        description: lines.join("\n"),
        url: `${origin}/package-progress`,
        start: { date: pacificDateKey(closesAt) }
      }];
    });
  });
}

export function showDayEvents(
  userId: string,
  days: FeedShowDay[],
  directory: CastNameDirectory,
  origin: string
): IcsEvent[] {
  const isMe = (name: string) => castNameMatchesUser(directory, userId, name);
  return days.flatMap((day) => {
    const label = formatShowDateLabel(day.date);
    const url = `${origin}/master-calendar?month=${day.date.slice(0, 7)}`;
    const events: IcsEvent[] = [];
    if (day.anchors.some(isMe)) {
      const partner = day.anchors.filter((name) => !isMe(name));
      events.push({
        uid: `anchor-${day.date}@infocus-portal`,
        summary: "Anchoring the show",
        description: [
          `You're anchoring the ${label} show.`,
          ...(partner.length > 0 ? [`With ${partner.join(" and ")}.`] : []),
          "Dropping a slot needs 48 hours' notice."
        ].join("\n"),
        url,
        start: { date: day.date }
      });
    }
    if (day.paAnnouncers.some(isMe)) {
      events.push({
        uid: `pa-${day.date}@infocus-portal`,
        summary: "PA announcements",
        description: `You're reading the PA announcements on ${label}.`,
        url,
        start: { date: day.date }
      });
    }
    for (const [role, name] of Object.entries(day.assignments)) {
      if (typeof name !== "string" || !isMe(name)) continue;
      events.push({
        uid: `crew-${day.date}-${role.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@infocus-portal`,
        summary: `Show role: ${role}`,
        description: `You're ${role} for the ${label} show.`,
        url: `${origin}/show-roles?date=${day.date}`,
        start: { date: day.date }
      });
    }
    return events;
  });
}

export function livestreamEvents(events: FeedLivestream[], origin: string): IcsEvent[] {
  return events.map((event) => {
    const start = event.arrivesAt && event.arrivesAt < event.startsAt ? event.arrivesAt : event.startsAt;
    return {
      uid: `livestream-${event.id}@infocus-portal`,
      summary: `Livestream: ${event.title}${event.pending ? " (sign-up pending)" : ""}`,
      description: [
        ...(event.arrivesAt ? [`Crew arrives ${pacificTime.format(event.arrivesAt)} Pacific.`] : []),
        `Starts ${pacificTime.format(event.startsAt)} Pacific.`,
        ...(event.location.trim() ? [`Where: ${event.location.trim()}`] : [])
      ].join("\n"),
      url: `${origin}/livestreams`,
      start: { at: start },
      end: { at: new Date(event.startsAt.getTime() + LIVESTREAM_BLOCK_MS) }
    };
  });
}
