import { MEETINGS_TIME_ZONE, PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { resolveProducerSeriesMeetingId } from "@/src/server/meetings-schedule";

/**
 * What a signed-out link preview (iMessage, Slack, …) may show for a meeting link: the title, the
 * time and the open agenda lines, nothing else (never attendees or invitees). Anyone with the link
 * can read these. Unknown ids get a generic card; a cancelled meeting says so without a time.
 */

export type MeetingPreview = {
  title: string;
  /** "Sunday, October 5 · 9:15 PM Pacific · InFocus Portal", "Happening now · InFocus Portal", or just "InFocus Portal". */
  description: string;
  /** The date/time line on the image; null when there's no time to show. */
  when: string | null;
  /** The first open (unchecked) agenda lines, in order and clipped; empty when there are none. */
  agenda: string[];
  /** Open agenda lines beyond `agenda` ("+N more"). */
  agendaMore: number;
};

export const GENERIC_MEETING_PREVIEW: MeetingPreview = {
  title: "InFocus meeting",
  description: "InFocus Portal",
  when: null,
  agenda: [],
  agendaMore: 0
};

/** Lines that fit under the title and time on the 1200×630 card. */
export const PREVIEW_AGENDA_LINES = 3;
const PREVIEW_AGENDA_CHARS = 64;

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

function clip(text: string) {
  return text.length > PREVIEW_AGENDA_CHARS ? `${text.slice(0, PREVIEW_AGENDA_CHARS - 1).trimEnd()}…` : text;
}

type PreviewMeeting = {
  title: string;
  startsAt: Date;
  status: string;
  /** Open agenda items in position order. */
  agendaItems?: { text: string }[];
};

/** Pure: the preview for a meeting row (or null for an unknown id). Access mode doesn't matter here. */
export function previewFromMeeting(meeting: PreviewMeeting | null): MeetingPreview {
  if (!meeting) return GENERIC_MEETING_PREVIEW;
  if (meeting.status === "CANCELED") {
    return { ...GENERIC_MEETING_PREVIEW, title: `Cancelled · ${meeting.title}` };
  }
  const when = meeting.status === "LIVE" ? "Happening now" : pacificWhen(meeting.startsAt);
  const open = meeting.agendaItems ?? [];
  // "+1 more" would take the same room as the line itself, so show it instead.
  const shown = open.length > PREVIEW_AGENDA_LINES + 1 ? PREVIEW_AGENDA_LINES : open.length;
  return {
    title: meeting.title,
    description: `${when} · InFocus Portal`,
    when,
    agenda: open.slice(0, shown).map((item) => clip(item.text)),
    agendaMore: open.length - shown
  };
}

/** `id` is a meeting id or "producers" (the stable InFocus Producer Meeting link). */
export async function loadMeetingPreview(id: string): Promise<MeetingPreview> {
  if (!ID_PATTERN.test(id)) return GENERIC_MEETING_PREVIEW;
  try {
    const meetingId = id === PRODUCER_SERIES.seriesKey ? await resolveProducerSeriesMeetingId() : id;
    if (!meetingId) return { ...GENERIC_MEETING_PREVIEW, title: PRODUCER_SERIES.title };
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        title: true,
        startsAt: true,
        status: true,
        agendaItems: { where: { done: false }, orderBy: { position: "asc" }, select: { text: true } }
      }
    });
    return previewFromMeeting(meeting);
  } catch (error) {
    console.error("Meeting preview failed", error instanceof Error ? error.message : error);
    return GENERIC_MEETING_PREVIEW;
  }
}
