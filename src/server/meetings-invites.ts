import { z } from "zod";
import { sendCalendarEmail } from "@/src/lib/email";
import { inngest } from "@/src/lib/inngest";
import { mainAppOrigin } from "@/src/lib/hosts";
import {
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
import type { MeetingInviteEmailView, MeetingInviteListResponse } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";
import type { MeetingViewer } from "@/src/server/meetings-access";
import { isMeetingExec } from "@/src/server/meetings-rules";

/**
 * Calendar invites (.ics by email) for the recurring Producer meeting. Execs manage the address list;
 * every producer can read it. Sends never block the action that triggered them.
 */

const SERIES_KEY = PRODUCER_SERIES.seriesKey;
/** Resend's default limit is 2 requests a second. */
const SEND_GAP_MS = 550;
/** Adding an address that was just invited doesn't email it again. */
export const REINVITE_COOLDOWN_MS = 10 * 60 * 1000;
export const MEETING_INVITES_EVENT = "meetings/invites.send";

const jobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("series") }),
  z.object({
    kind: z.literal("move"),
    occurrenceKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startsAt: z.string().datetime(),
    durationMinutes: z.number().int().min(5).max(480)
  }),
  z.object({
    kind: z.literal("cancel"),
    occurrenceKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    durationMinutes: z.number().int().min(5).max(480)
  })
]);
export type MeetingInvitesJob = z.infer<typeof jobSchema>;

type InviteRow = { id: string; email: string; name: string | null; createdAt: Date; lastInvitedAt: Date | null };

const inviteSelect = { id: true, email: true, name: true, createdAt: true, lastInvitedAt: true } as const;

function toView(row: InviteRow): MeetingInviteEmailView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastInvitedAt: row.lastInvitedAt?.toISOString() ?? null
  };
}

function requireExec(viewer: MeetingViewer) {
  if (!isMeetingExec(viewer.role)) throw new Error("FORBIDDEN");
}

export function producerSeriesUrl() {
  return `${mainAppOrigin().replace(/\/+$/, "")}/meet/producers`;
}

export function producerSeriesUid() {
  return `producers-series@${new URL(mainAppOrigin()).host}`;
}

/** Monotonic iCalendar SEQUENCE for the series (one bump per send round). */
async function nextSequence() {
  const row = await prisma.meetingSeriesCalendar.upsert({
    where: { seriesKey: SERIES_KEY },
    create: { seriesKey: SERIES_KEY, sequence: 1 },
    update: { sequence: { increment: 1 } },
    select: { sequence: true }
  });
  return row.sequence;
}

function base(attendee: InviteRow, sequence: number, now: Date): IcsBase | null {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) return null;
  return {
    uid: producerSeriesUid(),
    sequence,
    title: PRODUCER_SERIES.title,
    url: producerSeriesUrl(),
    organizer: { email: from, name: "InFocus Portal" },
    attendee: { email: attendee.email, name: attendee.name },
    now
  };
}

function pacificLabel(instant: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MEETINGS_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(instant);
}

type Mail = { subject: string; heading: string; paragraphs: string[]; method: IcsMethod; ics: (b: IcsBase) => string };

/** Sends one calendar email per address (each has its own ATTENDEE), one after another. */
async function sendToRows(rows: InviteRow[], mail: Mail, now: Date) {
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const sequence = await nextSequence();
  let sent = 0;
  for (const [index, row] of rows.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    const icsBase = base(row, sequence, now);
    if (!icsBase) break;
    const ok = await sendCalendarEmail({
      to: row.email,
      subject: mail.subject,
      heading: mail.heading,
      paragraphs: mail.paragraphs,
      ctaLabel: "Open the meeting",
      ctaUrl: producerSeriesUrl(),
      ics: mail.ics(icsBase),
      method: mail.method
    });
    if (!ok) continue;
    sent += 1;
    // Recorded as we go, so a job cut short still shows who got it.
    await prisma.meetingInviteEmail.updateMany({ where: { id: row.id }, data: { lastInvitedAt: new Date() } });
  }
  return { sent, failed: rows.length - sent };
}

/** First upcoming slot plus every later moved or cancelled slot, so a resend keeps those changes. */
async function seriesShape(now: Date) {
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

const SERIES_PARAGRAPHS = [
  "You're invited to the InFocus Producer meeting: every Sunday, Monday and Wednesday at 9:15 PM Pacific.",
  "Encrypted InFocus meeting. Sign in with your InFocus account to join."
];

async function sendSeriesInvite(rows: InviteRow[], now: Date) {
  const shape = await seriesShape(now);
  return sendToRows(
    rows,
    {
      subject: "Invitation: Producer meeting (Sun, Mon, Wed 9:15 PM Pacific)",
      heading: "Producer meeting",
      paragraphs: SERIES_PARAGRAPHS,
      method: "REQUEST",
      ics: (b) => buildSeriesInvite({ ...b, ...shape, durationMinutes: PRODUCER_SERIES.durationMinutes })
    },
    now
  );
}

export async function listMeetingInvites(viewer: MeetingViewer): Promise<MeetingInviteListResponse> {
  const rows = await prisma.meetingInviteEmail.findMany({
    where: { seriesKey: SERIES_KEY },
    orderBy: { email: "asc" },
    select: inviteSelect
  });
  return { invites: rows.map(toView), canManage: isMeetingExec(viewer.role) };
}

export async function addMeetingInvite(viewer: MeetingViewer, input: { email: string; name?: string }, now = new Date()) {
  requireExec(viewer);
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const existing = await prisma.meetingInviteEmail.findUnique({
    where: { seriesKey_email: { seriesKey: SERIES_KEY, email } },
    select: { lastInvitedAt: true }
  });
  const row = await prisma.meetingInviteEmail.upsert({
    where: { seriesKey_email: { seriesKey: SERIES_KEY, email } },
    create: { seriesKey: SERIES_KEY, email, name, addedById: viewer.userId },
    update: name ? { name } : {},
    select: inviteSelect
  });
  const recentlyInvited =
    existing?.lastInvitedAt && now.getTime() - existing.lastInvitedAt.getTime() < REINVITE_COOLDOWN_MS;
  if (recentlyInvited) return { invite: toView(row), emailed: false };
  const result = await sendSeriesInvite([row], now).catch((error) => {
    console.error("Meeting invite send failed", error instanceof Error ? error.message : error);
    return { sent: 0, failed: 1 };
  });
  const updated = result.sent ? { ...row, lastInvitedAt: now } : row;
  return { invite: toView(updated), emailed: result.sent === 1 };
}

export async function removeMeetingInvite(viewer: MeetingViewer, inviteId: string, now = new Date()) {
  requireExec(viewer);
  const row = await prisma.meetingInviteEmail.findFirst({ where: { id: inviteId, seriesKey: SERIES_KEY }, select: inviteSelect });
  if (!row) throw new Error("NOT_FOUND");
  await prisma.meetingInviteEmail.delete({ where: { id: row.id } });
  const firstStart = (await seriesShape(now)).firstStart;
  const result = await sendToRows(
    [row],
    {
      subject: "Cancelled: Producer meeting",
      heading: "Producer meeting removed from your calendar",
      paragraphs: ["You'll no longer get calendar invites for the InFocus Producer meeting."],
      method: "CANCEL",
      ics: (b) => buildSeriesCancel({ ...b, firstStart, durationMinutes: PRODUCER_SERIES.durationMinutes })
    },
    now
  ).catch((error) => {
    console.error("Meeting invite cancel failed", error instanceof Error ? error.message : error);
    return { sent: 0, failed: 1 };
  });
  return { removed: true, emailed: result.sent === 1 };
}

/** Queues the resend to every address (Inngest), so the request returns right away. */
export async function sendAllMeetingInvites(viewer: MeetingViewer) {
  requireExec(viewer);
  const recipients = await prisma.meetingInviteEmail.count({ where: { seriesKey: SERIES_KEY } });
  if (recipients === 0) return { queued: false, recipients };
  return { queued: await queueMeetingInvites({ kind: "series" }), recipients };
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

/** Inngest job: the bulk send itself (one email per address, spaced for Resend). */
export async function runMeetingInvitesJob(data: unknown, now = new Date()) {
  const job = jobSchema.parse(data);
  const rows = await prisma.meetingInviteEmail.findMany({ where: { seriesKey: SERIES_KEY }, select: inviteSelect });
  if (job.kind === "series") return sendSeriesInvite(rows, now);

  const originalStart = producerSlotStart(job.occurrenceKey);
  if (job.kind === "move") {
    const startsAt = new Date(job.startsAt);
    return sendToRows(
      rows,
      {
        subject: `Updated: Producer meeting on ${pacificLabel(originalStart)}`,
        heading: "Producer meeting moved",
        paragraphs: [`The ${pacificLabel(originalStart)} Producer meeting moved to ${pacificLabel(startsAt)} (Pacific).`],
        method: "REQUEST",
        ics: (b) => buildOccurrenceUpdate({ ...b, originalStart, start: startsAt, durationMinutes: job.durationMinutes })
      },
      now
    );
  }
  return sendToRows(
    rows,
    {
      subject: `Cancelled: Producer meeting on ${pacificLabel(originalStart)}`,
      heading: "Producer meeting cancelled",
      paragraphs: [`The ${pacificLabel(originalStart)} Producer meeting (Pacific) is cancelled. The others are unchanged.`],
      method: "CANCEL",
      ics: (b) => buildOccurrenceCancel({ ...b, originalStart, durationMinutes: job.durationMinutes })
    },
    now
  );
}
