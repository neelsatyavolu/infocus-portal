import { z } from "zod";
import { sendCalendarEmail } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { inngest } from "@/src/lib/inngest";
import {
  buildEventCancel,
  buildEventInvite,
  buildOccurrenceCancel,
  buildOccurrenceUpdate,
  buildSeriesCancel,
  buildSeriesInvite,
  type IcsBase,
  type IcsMethod,
  type MovedOccurrence
} from "@/src/lib/meetings/ics";
import {
  MEETINGS_TIME_ZONE,
  PRODUCER_SERIES,
  pacificDateKey,
  producerOccurrences,
  producerSlotStart
} from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import type { MeetingAccessFields } from "@/src/server/meetings-rules";

/**
 * Calendar emails (.ics), sent by the Inngest job `meetings/invites.send` one address at a time:
 * the recurring series (UID producers-series@<host>) and one-off meetings (UID meeting-<id>@<host>).
 */

export const SERIES_KEY = PRODUCER_SERIES.seriesKey;
export const MEETING_INVITES_EVENT = "meetings/invites.send";
/** Resend's default limit is 2 requests a second. */
const SEND_GAP_MS = 550;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutes = z.number().int().min(5).max(480);

const jobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("series") }),
  z.object({ kind: z.literal("move"), occurrenceKey: dateKey, startsAt: z.string().datetime(), durationMinutes: minutes }),
  z.object({ kind: z.literal("cancel"), occurrenceKey: dateKey, durationMinutes: minutes }),
  z.object({
    kind: z.literal("event"),
    meetingId: z.string().min(1).max(64),
    method: z.enum(["REQUEST", "CANCEL"]),
    sequence: z.number().int().min(0),
    /** Only these producers' addresses (added or removed invitees). Omitted: everyone the meeting is for. */
    onlyUserIds: z.array(z.string().min(1).max(64)).max(200).optional(),
    /** CANCEL to someone taken off the meeting (the meeting itself goes on). */
    uninvited: z.boolean().optional()
  })
]);
export type MeetingInvitesJob = z.infer<typeof jobSchema>;

export type InviteRow = {
  id: string;
  email: string;
  name: string | null;
  userId: string | null;
  createdAt: Date;
  lastInvitedAt: Date | null;
};

export const inviteSelect = {
  id: true,
  email: true,
  name: true,
  userId: true,
  createdAt: true,
  lastInvitedAt: true
} as const;

function origin() {
  return mainAppOrigin().replace(/\/+$/, "");
}

export function producerSeriesUrl() {
  return `${origin()}/meet/producers`;
}

export function producerSeriesUid() {
  return `producers-series@${new URL(origin()).host}`;
}

export function meetingEventUrl(meetingId: string) {
  return `${origin()}/meet/${meetingId}`;
}

export function meetingEventUid(meetingId: string) {
  return `meeting-${meetingId}@${new URL(origin()).host}`;
}

export function pacificLabel(instant: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MEETINGS_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(instant);
}

/**
 * Which list addresses a one-off meeting's calendar email goes to. OPEN: every address.
 * INVITE_ONLY: only addresses linked to the creator or an invitee. `onlyUserIds` narrows further.
 */
export function eventInviteRecipients<T extends { userId: string | null }>(
  rows: T[],
  meeting: MeetingAccessFields,
  onlyUserIds?: string[]
) {
  const allowed =
    meeting.access === "OPEN"
      ? null
      : new Set([...(meeting.createdById ? [meeting.createdById] : []), ...meeting.inviteeUserIds]);
  return rows.filter((row) => {
    if (onlyUserIds) return Boolean(row.userId && onlyUserIds.includes(row.userId));
    return allowed === null || Boolean(row.userId && allowed.has(row.userId));
  });
}

type Mail = {
  uid: string;
  url: string;
  title: string;
  sequence: number;
  subject: string;
  heading: string;
  paragraphs: string[];
  method: IcsMethod;
  ics: (b: IcsBase) => string;
};

/** One calendar email per address (each has its own ATTENDEE), spaced for Resend; stamps lastInvitedAt as it goes. */
export async function sendCalendarMail(rows: InviteRow[], mail: Mail, now: Date) {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (rows.length === 0 || !from) return { sent: 0, failed: rows.length };
  let sent = 0;
  for (const [index, row] of rows.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    const icsBase: IcsBase = {
      uid: mail.uid,
      sequence: mail.sequence,
      title: mail.title,
      url: mail.url,
      organizer: { email: from, name: "InFocus Portal" },
      attendee: { email: row.email, name: row.name },
      now
    };
    const ok = await sendCalendarEmail({
      to: row.email,
      subject: mail.subject,
      heading: mail.heading,
      paragraphs: mail.paragraphs,
      ctaLabel: "Open the meeting",
      ctaUrl: mail.url,
      ics: mail.ics(icsBase),
      method: mail.method
    });
    if (!ok) continue;
    sent += 1;
    await prisma.meetingInviteEmail.updateMany({ where: { id: row.id }, data: { lastInvitedAt: new Date() } });
  }
  return { sent, failed: rows.length - sent };
}

/** Monotonic SEQUENCE for the series (one bump per send round). */
export async function nextSeriesSequence() {
  const row = await prisma.meetingSeriesCalendar.upsert({
    where: { seriesKey: SERIES_KEY },
    create: { seriesKey: SERIES_KEY, sequence: 1 },
    update: { sequence: { increment: 1 } },
    select: { sequence: true }
  });
  return row.sequence;
}

/** First upcoming slot plus every later moved or cancelled slot, so a resend keeps those changes. */
export async function seriesShape(now: Date) {
  const first = producerOccurrences(now)[0];
  const firstStart = producerSlotStart(first?.occurrenceKey ?? pacificDateKey(now));
  const rows = await prisma.meeting.findMany({
    where: { seriesKey: SERIES_KEY, occurrenceKey: { gte: pacificDateKey(firstStart) } },
    select: { occurrenceKey: true, startsAt: true, durationMinutes: true, status: true }
  });
  const moved: MovedOccurrence[] = [];
  const cancelledStarts: Date[] = [];
  for (const row of rows) {
    if (!row.occurrenceKey) continue;
    const originalStart = producerSlotStart(row.occurrenceKey);
    if (row.status === "CANCELED") cancelledStarts.push(originalStart);
    else if (row.startsAt.getTime() !== originalStart.getTime() || row.durationMinutes !== PRODUCER_SERIES.durationMinutes) {
      moved.push({ originalStart, start: row.startsAt, durationMinutes: row.durationMinutes });
    }
  }
  return { firstStart, moved, cancelledStarts };
}

function seriesMail(sequence: number) {
  return { uid: producerSeriesUid(), url: producerSeriesUrl(), title: PRODUCER_SERIES.title, sequence };
}

export async function sendSeriesInvite(rows: InviteRow[], now: Date) {
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const shape = await seriesShape(now);
  return sendCalendarMail(
    rows,
    {
      ...seriesMail(await nextSeriesSequence()),
      subject: `Invitation: ${PRODUCER_SERIES.title} (Sun, Mon, Wed 9:15 PM Pacific)`,
      heading: PRODUCER_SERIES.title,
      paragraphs: [
        `You're invited to the ${PRODUCER_SERIES.title}: every Sunday, Monday and Wednesday at 9:15 PM Pacific.`,
        "Encrypted InFocus meeting. Sign in with your InFocus account to join."
      ],
      method: "REQUEST",
      ics: (b) => buildSeriesInvite({ ...b, ...shape, durationMinutes: PRODUCER_SERIES.durationMinutes })
    },
    now
  );
}

export async function sendSeriesRemoval(row: InviteRow, now: Date) {
  const { firstStart } = await seriesShape(now);
  return sendCalendarMail(
    [row],
    {
      ...seriesMail(await nextSeriesSequence()),
      subject: `Cancelled: ${PRODUCER_SERIES.title}`,
      heading: `${PRODUCER_SERIES.title} removed from your calendar`,
      paragraphs: [`You'll no longer get calendar invites for the ${PRODUCER_SERIES.title}.`],
      method: "CANCEL",
      ics: (b) => buildSeriesCancel({ ...b, firstStart, durationMinutes: PRODUCER_SERIES.durationMinutes })
    },
    now
  );
}

async function runOccurrenceJob(job: Extract<MeetingInvitesJob, { kind: "move" | "cancel" }>, rows: InviteRow[], now: Date) {
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const originalStart = producerSlotStart(job.occurrenceKey);
  const when = pacificLabel(originalStart);
  const mail = seriesMail(await nextSeriesSequence());
  if (job.kind === "move") {
    const startsAt = new Date(job.startsAt);
    return sendCalendarMail(
      rows,
      {
        ...mail,
        subject: `Updated: ${PRODUCER_SERIES.title} on ${when}`,
        heading: `${PRODUCER_SERIES.title} moved`,
        paragraphs: [`The ${when} ${PRODUCER_SERIES.title} moved to ${pacificLabel(startsAt)} (Pacific).`],
        method: "REQUEST",
        ics: (b) => buildOccurrenceUpdate({ ...b, originalStart, start: startsAt, durationMinutes: job.durationMinutes })
      },
      now
    );
  }
  return sendCalendarMail(
    rows,
    {
      ...mail,
      subject: `Cancelled: ${PRODUCER_SERIES.title} on ${when}`,
      heading: `${PRODUCER_SERIES.title} cancelled`,
      paragraphs: [`The ${when} ${PRODUCER_SERIES.title} (Pacific) is cancelled. The others are unchanged.`],
      method: "CANCEL",
      ics: (b) => buildOccurrenceCancel({ ...b, originalStart, durationMinutes: job.durationMinutes })
    },
    now
  );
}

async function runEventJob(job: Extract<MeetingInvitesJob, { kind: "event" }>, rows: InviteRow[], now: Date) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: job.meetingId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      status: true,
      access: true,
      createdById: true,
      inviteeUserIds: true,
      seriesKey: true
    }
  });
  if (!meeting || meeting.seriesKey) return { sent: 0, failed: 0 };
  // A queued invite for a meeting that has since been cancelled or held is stale.
  if (job.method === "REQUEST" && meeting.status !== "SCHEDULED") return { sent: 0, failed: 0 };

  const recipients = eventInviteRecipients(rows, meeting, job.onlyUserIds);
  const when = `${pacificLabel(meeting.startsAt)} (Pacific)`;
  const base = { uid: meetingEventUid(meeting.id), url: meetingEventUrl(meeting.id), title: meeting.title, sequence: job.sequence };
  const shape = { start: meeting.startsAt, durationMinutes: meeting.durationMinutes };

  if (job.method === "REQUEST") {
    const updated = job.sequence > 1 && !job.onlyUserIds;
    return sendCalendarMail(
      recipients,
      {
        ...base,
        subject: `${updated ? "Updated" : "Invitation"}: ${meeting.title}, ${pacificLabel(meeting.startsAt)}`,
        heading: meeting.title,
        paragraphs: [
          `${updated ? "New time" : "You're invited"}: ${when}.`,
          "Encrypted InFocus meeting. Sign in with your InFocus account to join."
        ],
        method: "REQUEST",
        ics: (b) => buildEventInvite({ ...b, ...shape })
      },
      now
    );
  }
  return sendCalendarMail(
    recipients,
    {
      ...base,
      subject: `Cancelled: ${meeting.title}, ${pacificLabel(meeting.startsAt)}`,
      heading: `${meeting.title} ${job.uninvited ? "removed from your calendar" : "cancelled"}`,
      paragraphs: [
        job.uninvited ? `You're no longer invited to ${meeting.title} on ${when}.` : `${meeting.title} on ${when} is cancelled.`
      ],
      method: "CANCEL",
      ics: (b) => buildEventCancel({ ...b, ...shape })
    },
    now
  );
}

/** Never throws: a failed enqueue is logged and the triggering action still succeeds. */
export async function queueMeetingInvites(job: MeetingInvitesJob) {
  try {
    await inngest.send({ name: MEETING_INVITES_EVENT, data: job });
    return true;
  } catch (error) {
    console.error("Meeting invites enqueue failed", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Inngest job: every bulk or automatic calendar email. */
export async function runMeetingInvitesJob(data: unknown, now = new Date()) {
  const job = jobSchema.parse(data);
  const rows = await prisma.meetingInviteEmail.findMany({ where: { seriesKey: SERIES_KEY }, select: inviteSelect });
  if (job.kind === "series") return sendSeriesInvite(rows, now);
  if (job.kind === "event") return runEventJob(job, rows, now);
  return runOccurrenceJob(job, rows, now);
}
