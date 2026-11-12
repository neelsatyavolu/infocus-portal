import { deadlineClosesAt, finalCutClosesAt } from "@/src/lib/deadlines";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { brainstormMaterialsReady } from "@/src/lib/package-brainstorm";
import { approvedExtensionDaysFor, effectiveDeadline, type ExtensionGrant } from "@/src/lib/package-extensions";
import { stageEmailLabel, studentStagePath, untitledTopic } from "@/src/lib/package-stage-events";
import type { GroupStageSlug } from "@/src/lib/package-stages";
import { prisma } from "@/src/lib/prisma";
import { addDaysToDateKey } from "@/src/lib/show-assignment";
import { getCycleNumbers } from "@/src/server/program-settings";
import { sendPushToUserIds } from "@/src/server/push-notify";

const PACIFIC = "America/Los_Angeles";
/** Longest extension a producer can grant (MAX_EXTENSION_DAYS) plus a day of slack for decimals. */
const EXTENSION_LOOKBACK_DAYS = 31;

export const DEADLINE_STAGES = ["pitching", "brainstorming", "a-roll", "initial-cut", "final-cut"] as const;
export type DeadlineStage = (typeof DEADLINE_STAGES)[number] & GroupStageSlug;

export type DeadlineCycle = {
  cycleNumber: number;
  pitchingDate: Date | null;
  proofOfContactDate: Date | null;
  aRollBRollDate: Date | null;
  initialCutDate: Date | null;
  finalCutDate: Date | null;
};

export type DeadlineRow = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  extension: boolean;
  extensionRequests: ExtensionGrant[];
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  finalCut: boolean;
  brainstormDocUrl: string;
  proofOfContactCount: number;
  hasARollMedia: boolean;
  initialCutMediaItemId: string | null;
  finalCutMediaItemId: string | null;
  memberUserIds: string[];
};

export type StageDeadlineReminder = {
  rowId: string;
  cycleNumber: number;
  groupTopic: string;
  stage: DeadlineStage;
  dueDateKey: string;
  closesAt: Date;
  userIds: string[];
};

function baseDate(stage: DeadlineStage, cycle: DeadlineCycle) {
  switch (stage) {
    case "pitching":
      return cycle.pitchingDate;
    case "brainstorming":
      return cycle.proofOfContactDate;
    case "a-roll":
      return cycle.aRollBRollDate;
    case "initial-cut":
      return cycle.initialCutDate;
    case "final-cut":
      return cycle.finalCutDate;
  }
}

/**
 * When a stage closes for one student: the cycle date at 11:59 PM Pacific (the Final Cut uses
 * its own close), moved by the student's approved extension days (cycleCheckInDates rule).
 */
export function stageDeadlineClosesAt(stage: DeadlineStage, cycle: DeadlineCycle, extensionDays: number) {
  const shifted = effectiveDeadline(baseDate(stage, cycle), extensionDays);
  if (!shifted) return null;
  return stage === "final-cut" ? finalCutClosesAt(shifted) : deadlineClosesAt(shifted);
}

/** Whether the group already turned the stage in (or a producer marked it done). */
export function stageTurnedIn(stage: DeadlineStage, row: DeadlineRow) {
  switch (stage) {
    case "pitching":
      // Pitching has no upload: a producer marks it.
      return row.pitching;
    case "brainstorming":
      return row.proofOfContact || brainstormMaterialsReady(row.proofOfContactCount, row.brainstormDocUrl);
    case "a-roll":
      // Footage awaiting approval is the producer's move; the review reminders cover it.
      return row.aRollBRoll || row.hasARollMedia;
    case "initial-cut":
      return row.initialCut || Boolean(row.initialCutMediaItemId);
    case "final-cut":
      return row.finalCut || Boolean(row.finalCutMediaItemId);
  }
}

/**
 * Members whose stage closes on `dueDateKey` (Pacific) and whose group hasn't turned it in,
 * one entry per (group, stage). Each member's own extension days move their deadline.
 */
export function selectStageDeadlineReminders(input: {
  cycles: DeadlineCycle[];
  rows: DeadlineRow[];
  dueDateKey: string;
}): StageDeadlineReminder[] {
  const cycleByNumber = new Map(input.cycles.map((cycle) => [cycle.cycleNumber, cycle]));
  const reminders: StageDeadlineReminder[] = [];
  for (const row of input.rows) {
    const cycle = cycleByNumber.get(row.cycleNumber);
    if (!cycle) continue;
    for (const stage of DEADLINE_STAGES) {
      if (stageTurnedIn(stage, row)) continue;
      const due = row.memberUserIds.flatMap((userId) => {
        const closes = stageDeadlineClosesAt(stage, cycle, approvedExtensionDaysFor(row, userId));
        return closes && pacificDateKey(closes) === input.dueDateKey ? [{ userId, closes }] : [];
      });
      if (due.length > 0) {
        // Decimal extensions can close at different times of the same day; quote the latest.
        const closesAt = new Date(Math.max(...due.map((entry) => entry.closes.getTime())));
        const userIds = due.map((entry) => entry.userId);
        reminders.push({
          rowId: row.id,
          cycleNumber: row.cycleNumber,
          groupTopic: row.groupTopic,
          stage,
          dueDateKey: input.dueDateKey,
          closesAt,
          userIds
        });
      }
    }
  }
  return reminders;
}

/** Dedupe key: one reminder per group, stage and due date. */
export function stageDeadlineReminderKey(rowId: string, stage: DeadlineStage, dueDateKey: string) {
  return `deadline:${stage}:${dueDateKey}:${rowId}`;
}

function stageLabel(stage: DeadlineStage) {
  return stage === "pitching" ? "Pitch" : stageEmailLabel(stage);
}

export function stageDeadlineMail(reminder: StageDeadlineReminder) {
  const label = stageLabel(reminder.stage);
  const topic = `${untitledTopic(reminder.groupTopic)} (Cycle ${reminder.cycleNumber})`;
  const when = reminder.closesAt.toLocaleString("en-US", {
    timeZone: PACIFIC,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  const note =
    reminder.stage === "a-roll"
      ? "A-roll/B-roll counts once a producer approves it, so upload your footage soon."
      : reminder.stage === "pitching"
        ? "Your producer marks the pitch once you've pitched."
        : reminder.stage === "final-cut"
          ? "Nothing has been turned in yet. A late Final Cut loses 20%."
          : "Nothing has been turned in yet. A check-in with nothing turned in scores 0 after the deadline.";
  return {
    subject: `Due tomorrow: ${label} — ${untitledTopic(reminder.groupTopic)}`,
    heading: `${label} is due tomorrow`,
    paragraphs: [`${topic}: ${label} is due ${when} Pacific.`, note],
    ctaLabel: `Open ${label}`,
    path: studentStagePath(reminder.stage),
    pushTitle: `${label} due tomorrow`,
    pushBody: `${topic} is due ${when}.`
  };
}

async function claimReminder(rowId: string, key: string) {
  try {
    // DRAFT is never used by review notices, so these keys can't collide with them.
    await prisma.packageReviewNotice.create({ data: { progressRowId: rowId, stage: "DRAFT", mediaVersionId: key } });
    return true;
  } catch {
    return false;
  }
}

async function loadDeadlineData(cycleNumbers: number[], dueDateKey: string) {
  const cycles = await prisma.packageCycle.findMany({
    where: { cycleNumber: { in: cycleNumbers } },
    select: {
      cycleNumber: true,
      pitchingDate: true,
      proofOfContactDate: true,
      aRollBRollDate: true,
      initialCutDate: true,
      finalCutDate: true
    }
  });
  // Only cycles with a stage date that an extension could move onto tomorrow.
  const earliest = new Date(`${addDaysToDateKey(dueDateKey, -EXTENSION_LOOKBACK_DAYS)}T00:00:00.000Z`);
  const latest = new Date(`${addDaysToDateKey(dueDateKey, 1)}T00:00:00.000Z`);
  const live = cycles.filter((cycle) =>
    DEADLINE_STAGES.some((stage) => {
      const date = baseDate(stage, cycle);
      return date !== null && date >= earliest && date <= latest;
    })
  );
  if (live.length === 0) return { cycles: live, rows: [] as DeadlineRow[] };

  const rows = await prisma.packageProgressRow.findMany({
    where: { cycleNumber: { in: live.map((cycle) => cycle.cycleNumber) } },
    select: {
      id: true,
      cycleNumber: true,
      groupTopic: true,
      extension: true,
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      initialCut: true,
      finalCut: true,
      brainstormDocUrl: true,
      initialCutMediaItemId: true,
      finalCutMediaItemId: true,
      extensionRequests: {
        where: { status: "APPROVED" },
        select: { requestedDays: true, grantedDays: true, grantedUserIds: true }
      },
      _count: { select: { proofOfContacts: true } },
      stageMedia: { where: { stage: "a-roll" }, select: { id: true }, take: 1 },
      members: { select: { userId: true } }
    }
  });
  return {
    cycles: live,
    rows: rows.map(
      (row): DeadlineRow => ({
        id: row.id,
        cycleNumber: row.cycleNumber,
        groupTopic: row.groupTopic,
        extension: row.extension,
        extensionRequests: row.extensionRequests,
        pitching: row.pitching,
        proofOfContact: row.proofOfContact,
        aRollBRoll: row.aRollBRoll,
        initialCut: row.initialCut,
        finalCut: row.finalCut,
        brainstormDocUrl: row.brainstormDocUrl,
        proofOfContactCount: row._count.proofOfContacts,
        hasARollMedia: row.stageMedia.length > 0,
        initialCutMediaItemId: row.initialCutMediaItemId,
        finalCutMediaItemId: row.finalCutMediaItemId,
        memberUserIds: row.members.map((member) => member.userId)
      })
    )
  };
}

async function deliverReminder(reminder: StageDeadlineReminder) {
  const users = await prisma.user.findMany({
    where: { id: { in: reminder.userIds } },
    select: { id: true, email: true, notificationPreference: { select: { notificationEmail: true } } }
  });
  // A removed account (email cleared) gets no more package mail or pushes.
  const active = users.filter((user) => user.email);
  const emails = [
    ...new Set(
      active
        .map((user) => (user.notificationPreference?.notificationEmail ?? user.email)?.trim())
        .filter((email): email is string => Boolean(email))
    )
  ];
  if (active.length === 0) return false;

  const mail = stageDeadlineMail(reminder);
  const ctaUrl = `${mainAppOrigin().replace(/\/+$/, "")}${mail.path}`;
  const key = stageDeadlineReminderKey(reminder.rowId, reminder.stage, reminder.dueDateKey);
  if (emails.length > 0) {
    try {
      await sendBrandedEmails({
        recipients: emails,
        subject: mail.subject,
        heading: mail.heading,
        paragraphs: mail.paragraphs,
        ctaLabel: mail.ctaLabel,
        ctaUrl,
        push: { title: mail.pushTitle, body: mail.pushBody },
        idempotencyKey: `stage-deadline-reminder/${key}`
      });
    } catch (error) {
      console.error("stage deadline email failed", key, error);
    }
  }
  try {
    await sendPushToUserIds(
      active.map((user) => user.id),
      { title: mail.pushTitle, body: mail.pushBody, url: mail.path },
      "browser"
    );
  } catch (error) {
    console.error("stage deadline push failed", key, error);
  }
  return true;
}

/**
 * Daily (morning, Pacific): email and push every group member whose pitch, proof of contact,
 * A-roll/B-roll, Initial Cut or Final Cut is due tomorrow (after their own extension) and not
 * turned in yet. One reminder per group, stage and due date.
 */
export async function runStageDeadlineReminders(now = new Date()) {
  const dueDateKey = addDaysToDateKey(pacificDateKey(now), 1);
  const cycleNumbers = await getCycleNumbers();
  const { cycles, rows } = await loadDeadlineData(cycleNumbers, dueDateKey);
  const reminders = selectStageDeadlineReminders({ cycles, rows, dueDateKey });

  let sent = 0;
  for (const reminder of reminders) {
    const claimed = await claimReminder(
      reminder.rowId,
      stageDeadlineReminderKey(reminder.rowId, reminder.stage, reminder.dueDateKey)
    );
    if (!claimed) continue;
    try {
      if (await deliverReminder(reminder)) sent += 1;
    } catch (error) {
      console.error("stage deadline reminder failed", reminder.rowId, reminder.stage, error);
    }
  }
  return { dueDateKey, due: reminders.length, sent };
}
