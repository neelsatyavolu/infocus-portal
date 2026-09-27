import { z } from "zod";
import { extractCalendarAnchors } from "@/src/lib/calendar-show-content";
import { loadCollegeVisitBulletinAnnouncement } from "@/src/lib/college-visits-sheet";
import { mergeCollegeVisitIntoBulletin } from "@/src/lib/college-visits";
import { finalCutHeadline } from "@/src/lib/package-headline";
import { prisma } from "@/src/lib/prisma";
import { FIRST_SHOW_DATE, addDaysToDateKey, listShowDatesThrough, todayDateKey } from "@/src/lib/show-assignment";
import { RECENT_SHOW_COUNT, type ShowStoryData } from "@/src/lib/show-story";
import {
  collapseTeleprompterSpokenParagraphs,
  getGeminiClient,
  isTeleprompterCueLine
} from "@/src/lib/teleprompter-announcement-formatting";
import { TELEPROMPTER_TIME_ZONE, selectAnnouncementsForBulletin } from "@/src/lib/teleprompter-template";
import { userDisplayName } from "@/src/lib/user-display";
import { fetchSubmittedAnnouncements } from "@/src/server/announcement-submissions";
import { loadScheduleOverrides } from "@/src/server/show-schedule";

export const SHOW_SUMMARY_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** User-facing refusal with a plain message (the route turns it into `fail(message, status)`). */
export class ShowSummaryError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

/** Recent shows (newest first) plus the next upcoming one; the default is the latest show that has aired. */
export async function listRecapShowDates(now = new Date()) {
  const today = todayDateKey(now);
  const endKey = addDaysToDateKey(today, 30);
  const overrides = await loadScheduleOverrides(FIRST_SHOW_DATE, endKey);
  const all = listShowDatesThrough(endKey, overrides);
  const past = all.filter((date) => date <= today).slice(-RECENT_SHOW_COUNT).reverse();
  const next = all.find((date) => date > today);
  return { dates: next ? [next, ...past] : past, defaultDate: past[0] ?? next ?? today };
}

/** Spoken paragraphs of a teleprompter A2 section, one per announcement (cue lines and the heading dropped). */
export function bulletinParagraphs(content: string): string[] {
  return collapseTeleprompterSpokenParagraphs(content)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isTeleprompterCueLine(line));
}

/** What the teleprompter would pick for that date, in the submitters' own words. */
async function scheduledAnnouncements(showDate: Date): Promise<string[]> {
  let selected: Awaited<ReturnType<typeof fetchSubmittedAnnouncements>>["announcements"] = [];
  try {
    const submitted = await fetchSubmittedAnnouncements({ includeSchoologyOnly: false });
    selected = selectAnnouncementsForBulletin({ announcements: submitted.announcements, showDate, timeZone: TELEPROMPTER_TIME_ZONE });
  } catch (error) {
    console.error("Show story: submitted announcements unavailable", error);
  }
  try {
    selected = mergeCollegeVisitIntoBulletin(selected, await loadCollegeVisitBulletinAnnouncement(showDate));
  } catch (error) {
    console.error("Show story: college visits unavailable", error);
  }
  return selected.map((announcement) => announcement.announcement.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export async function loadShowStory(dateKey: string): Promise<ShowStoryData> {
  const showDate = new Date(`${dateKey}T12:00:00.000Z`);
  const [entry, show, rows, doc] = await Promise.all([
    prisma.masterCalendarEntry.findUnique({ where: { date: dateKey }, select: { content: true } }),
    prisma.showRolesShow.findUnique({ where: { date: dateKey }, select: { anchors: true } }),
    prisma.packageProgressRow.findMany({
      where: { queuedForAirAt: { not: null }, queuedForShowDate: dateKey },
      select: {
        id: true,
        groupTopic: true,
        // No email: a name-less account must never put an address on a public slide.
        members: { select: { user: { select: { name: true, nickname: true } } }, orderBy: { createdAt: "asc" } },
        finalCutMediaItem: { select: { title: true, currentVersion: { select: { nasPath: true } } } }
      },
      orderBy: { queuedForAirAt: "asc" }
    }),
    prisma.teleprompterDoc.findFirst({
      where: { showDate },
      select: { sections: { where: { label: "A2" }, select: { content: true }, take: 1 } },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  // Same precedence as The Show overview: Master Calendar anchors win over stored picks.
  const calendarAnchors = entry ? extractCalendarAnchors(entry.content) : [];
  const storedAnchors = Array.isArray(show?.anchors)
    ? show.anchors.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
  const aired = bulletinParagraphs(doc?.sections[0]?.content ?? "");

  return {
    date: dateKey,
    anchors: calendarAnchors.length > 0 ? calendarAnchors : storedAnchors,
    announcements: aired.length > 0 ? aired : await scheduledAnnouncements(showDate),
    announcementSource: aired.length > 0 ? "teleprompter" : "submissions",
    packages: rows.map((row) => ({
      id: row.id,
      title: finalCutHeadline(row.finalCutMediaItem) ?? row.groupTopic.trim(),
      reporters: row.members.map((member) => userDisplayName(member.user)).filter(Boolean)
    }))
  };
}

export const SHOW_SUMMARY_RULES = [
  "You write one-line summaries of school announcements for an Instagram story slide from InFocus, the Palo Alto High School student broadcast.",
  "Write one short phrase per announcement, 12 words or fewer, in sentence case.",
  "Lead with the event or news, then the most important date, time or place if the source has one.",
  "Use only facts in the source. Do not invent names, dates, times, places, links or details.",
  "Use AP style for dates and times: Oct. 2, Sept. 30, 3:30 p.m.",
  "No emoji, hashtags, exclamation points, questions, first person, or calls to action like Join or Don't miss.",
  "Do not end with a period.",
  "Example. Source: 'The Paly Blood Drive is Thursday, October 2nd from 8 a.m. to 2 p.m. in the Small Gym. Students 16 and older can sign up at the ASB office.' Write: 'Blood drive Thursday, Oct. 2 in the Small Gym; sign up at ASB'",
  "Return one summary for every index, in the same order."
];

const summarySchema = z.object({ summaries: z.array(z.object({ index: z.number().int(), text: z.string() })) });
const summaryJsonSchema = {
  type: "object",
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, text: { type: "string" } },
        required: ["index", "text"],
        additionalProperties: false
      }
    }
  },
  required: ["summaries"],
  additionalProperties: false
} as const;

export function buildShowSummaryPrompt(announcements: string[]) {
  return [
    ...SHOW_SUMMARY_RULES,
    "Return JSON only.",
    "",
    JSON.stringify({ announcements: announcements.map((text, index) => ({ index, text })) })
  ].join("\n");
}

/** One short line per announcement, in order. Throws ShowSummaryError with a message people can read. */
export async function summarizeShowAnnouncements(announcements: string[]): Promise<string[]> {
  const client = getGeminiClient();
  if (!client) throw new ShowSummaryError("Summaries aren’t set up on this server (no Gemini key). Write the lines yourself.", 503);

  let parsed: z.infer<typeof summarySchema>;
  try {
    const response = await client.models.generateContent({
      model: SHOW_SUMMARY_GEMINI_MODEL,
      contents: buildShowSummaryPrompt(announcements),
      config: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json", responseJsonSchema: summaryJsonSchema }
    });
    parsed = summarySchema.parse(JSON.parse(response.text || "{}"));
  } catch (error) {
    console.error("Show story: Gemini summary failed", error);
    throw new ShowSummaryError("Couldn’t summarize the announcements right now. Try again in a minute.");
  }

  const byIndex = new Map(parsed.summaries.map((entry) => [entry.index, entry.text.replace(/\s+/g, " ").trim().replace(/\.$/, "")]));
  const lines = announcements.map((_, index) => byIndex.get(index) ?? "");
  if (lines.every((line) => !line)) throw new ShowSummaryError("Gemini returned no summaries. Try again.");
  return lines;
}
