import { MEETINGS_TIME_ZONE, PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { resolveProducerSeriesMeetingId } from "@/src/server/meetings-schedule";

/**
 * What a signed-out link preview (iMessage, Slack, …) may show for a meeting link: the title and
 * the time, nothing else (never names, attendees or invitees). Unknown ids get a generic card;
 * a cancelled meeting says so without a time.
 */

export type MeetingPreview = {
  title: string;
  /** "Sunday, October 5 · 9:15 PM Pacific · InFocus Portal", "Happening now · InFocus Portal", or just "InFocus Portal". */
  description: string;
  /** The date/time line on the image; null when there's no time to show. */
  when: string | null;
};

export const GENERIC_MEETING_PREVIEW: MeetingPreview = { title: "InFocus meeting", description: "InFocus Portal", when: null };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function pacificWhen(startsAt: Date) {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: MEETINGS_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: MEETINGS_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(startsAt);
  return `${day} · ${time} Pacific`;
}

/** Pure: the preview for a meeting row (or null for an unknown id). Access mode doesn't matter here. */
export function previewFromMeeting(meeting: { title: string; startsAt: Date; status: string } | null): MeetingPreview {
  if (!meeting) return GENERIC_MEETING_PREVIEW;
  if (meeting.status === "CANCELED") {
    return { title: `Cancelled · ${meeting.title}`, description: "InFocus Portal", when: null };
  }
  const when = meeting.status === "LIVE" ? "Happening now" : pacificWhen(meeting.startsAt);
  return { title: meeting.title, description: `${when} · InFocus Portal`, when };
}

/** `id` is a meeting id or "producers" (the stable InFocus Producer Meeting link). */
export async function loadMeetingPreview(id: string): Promise<MeetingPreview> {
  if (!ID_PATTERN.test(id)) return GENERIC_MEETING_PREVIEW;
  try {
    const meetingId = id === PRODUCER_SERIES.seriesKey ? await resolveProducerSeriesMeetingId() : id;
    if (!meetingId) return { title: PRODUCER_SERIES.title, description: "InFocus Portal", when: null };
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { title: true, startsAt: true, status: true }
    });
    return previewFromMeeting(meeting);
  } catch (error) {
    console.error("Meeting preview failed", error instanceof Error ? error.message : error);
    return GENERIC_MEETING_PREVIEW;
  }
}
