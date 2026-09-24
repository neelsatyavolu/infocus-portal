import {
  extractCalendarAnchors,
  extractCalendarPaAnnouncers,
  extractCalendarShowManager
} from "@/src/lib/calendar-show-content";
import { groupTileStatus, type GroupTileStatusInput, type GroupTileStatusTone } from "@/src/lib/group-tile-status";
import { capacityTone, LIVESTREAM_AVAILABILITY_LABELS, type CapacityTone } from "@/src/lib/livestream";
import { effectiveGroupApprovalStage, GROUP_NAV_SLUGS, GROUP_NAV_TAB_LABELS, groupNavTabDone, pendingGroupNavSlug, type GroupNavSlug, type GroupNavState } from "@/src/lib/package-stages";
import { addDaysToDateKey, parseDateKeyUtc } from "@/src/lib/show-assignment";
import type { ScheduleKind } from "@/src/lib/school-schedule";

export const CLASS_BOARD_DAY_SPAN = 14;
export const CLASS_BOARD_TIME_ZONE = "America/Los_Angeles";

export const RACE_GATE_LABELS = GROUP_NAV_TAB_LABELS;

export type RaceDot = "done" | "current" | "upcoming";

export type ClassBoardGate = {
  key: GroupNavSlug;
  label: string;
  dateLabel: string | null;
};

export type ClassBoardLane = {
  id: string;
  place: number;
  topic: string;
  detail: string;
  extension: boolean;
  extensionDays: number;
  statusLabel: string;
  tone: GroupTileStatusTone;
  doneCount: number;
  dots: RaceDot[];
  segments: RaceDot[];
};

export type ClassBoardLivestream = {
  id: string;
  dateKey: string;
  dayLabel: string;
  timeLabel: string;
  started: boolean;
  title: string;
  where: string;
  crew: string;
  openLabel: string;
  tone: CapacityTone;
  availability: string;
};

export type ClassBoardDay = {
  date: string;
  weekday: string;
  dayNum: string;
  kind: ScheduleKind;
  kindLabel: string;
  lines: string[];
};

export type ClassBoardDeadline = {
  id: string;
  cycleNumber: number;
  label: string;
  dateKey: string;
  daysUntil: number;
  when: string;
  focus: string;
};

export type ClassBoardClassSession = { date: string; startsAt: string; endsAt: string };

export const CLASS_BOARD_DEADLINE_LIMIT = 7;

const DEADLINE_FIELDS = [
  { key: "pitching", label: "Pitching", focus: "Develop your pitch and confirm your group" },
  { key: "proofOfContact", label: "Proof of Contact & Brainstorming", focus: "Confirm interviews and finish your brainstorm" },
  { key: "aRollBRoll", label: "A-roll & b-roll", focus: "Film interviews and gather supporting B-roll" },
  { key: "initialCut", label: "Initial Cut", focus: "Build your story and submit your Initial Cut" },
  { key: "initialCutStage2", label: "Initial Cut · Stage 2", focus: "Revise your Initial Cut for adviser review" },
  { key: "initialCutStage3", label: "Initial Cut · Stage 3", focus: "Polish your Initial Cut for executive review" },
  { key: "finalCut", label: "Final Cut", focus: "Finish edits and submit your Final Cut" }
] as const;

export type ClassBoardModel = {
  classSessions: ClassBoardClassSession[];
  deadlines: ClassBoardDeadline[];
  generatedAt: string;
  cycleNumber: number;
  cycleFocus: string;
  gates: ClassBoardGate[];
  lanes: ClassBoardLane[];
  livestreams: ClassBoardLivestream[];
  days: ClassBoardDay[];
};

export type RacePackageInput = {
  id: string;
  initialCutReviewStage?: string | null;
  topic: string;
  memberNames: string[];
  producerName: string | null;
  extension: boolean;
  extensionDays?: number;
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  finalCut: boolean;
  status: GroupTileStatusInput;
};

const pacificDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLASS_BOARD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function pacificDateKey(now = new Date()) {
  return pacificDate.format(now);
}

function pacificOffsetMinutes(dateKey: string) {
  const noonUtc = new Date(`${dateKey}T12:00:00Z`);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: CLASS_BOARD_TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(noonUtc);
  const match = formatted.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) return -420;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + Math.sign(hours || 1) * minutes;
}

/** Midnight at the start of a Pacific calendar day. */
export function pacificDayStart(dateKey: string) {
  const offset = pacificOffsetMinutes(dateKey);
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - offset * 60_000);
}

export function classBoardWindow(now = new Date()) {
  const today = pacificDateKey(now);
  const end = addDaysToDateKey(today, CLASS_BOARD_DAY_SPAN);
  return {
    today,
    end,
    start: pacificDayStart(today),
    until: pacificDayStart(end)
  };
}

export function formatGateDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const key = (typeof value === "string" ? value : value.toISOString()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).format(parseDateKeyUtc(key));
}

export function formatBoardDay(dateKey: string) {
  const date = parseDateKeyUtc(dateKey);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date).toUpperCase(),
    dayNum: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(date),
    month: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(date)
  };
}

export function firstDisplayName(name: string) {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function raceDots(input: GroupNavState): RaceDot[] {
  const current = pendingGroupNavSlug(input);
  return GROUP_NAV_SLUGS.map((stage) => {
    if (groupNavTabDone(stage, input)) return "done";
    if (stage === current) return "current";
    return "upcoming";
  });
}

export function raceSegments(dots: RaceDot[]): RaceDot[] {
  return dots.slice(1).map((next) => (next === "upcoming" ? "upcoming" : next));
}

/** Within one stage, a revision request outranks pending review, which outranks work not turned in. */
const STATUS_RANK: Record<GroupTileStatusTone, number> = {
  approved: 4,
  warn: 2,
  review: 2,
  danger: 3,
  neutral: 1
};

type Standing = { doneCount: number; tone: GroupTileStatusTone; revisionVersion: number; extensionDays: number };

function sameStanding(left: Standing, right: Standing) {
  return left.doneCount === right.doneCount &&
    STATUS_RANK[left.tone] === STATUS_RANK[right.tone] &&
    left.revisionVersion === right.revisionVersion &&
    left.extensionDays === right.extensionDays;
}

function packageHasContent(row: RacePackageInput) {
  return Boolean(
    row.topic.trim() ||
      row.memberNames.some((name) => name.trim()) ||
      row.producerName?.trim() ||
      row.pitching ||
      row.proofOfContact ||
      row.aRollBRoll ||
      row.initialCut ||
      row.finalCut
  );
}

export function buildRaceLanes(rows: RacePackageInput[], now = Date.now()): ClassBoardLane[] {
  const lanes = rows.filter(packageHasContent).map((row) => {
    const done = {
      pitching: row.pitching,
      proofOfContact: row.proofOfContact,
      aRollBRoll: row.aRollBRoll,
      approvalStage: effectiveGroupApprovalStage(
        row.status.approvalStage,
        row.status.initialCutNeedsRevisions,
        row.initialCutReviewStage
      ),
      finalCut: row.finalCut
    };
    const dots = raceDots(done);
    const doneCount = dots.filter((dot) => dot === "done").length;
    const people = row.memberNames.map((name) => firstDisplayName(name)).filter(Boolean);
    const producer = row.producerName?.trim() ? firstDisplayName(row.producerName) : "";
    const detail = [people.join(", ") || "No members", producer ? `AP ${producer}` : ""]
      .filter(Boolean)
      .join(" · ");
    const status = groupTileStatus(row.status, now);
    return {
      id: row.id,
      place: 0,
      topic: row.topic.trim() || "Untitled package",
      detail,
      extension: row.extension,
      extensionDays: row.extensionDays ?? 0,
      statusLabel: status.label,
      tone: status.tone,
      revisionVersion: status.tone === "danger" && row.status.aRollBRoll && row.status.initialCutHasMedia
        ? row.status.initialCutVersionNumber ?? 0
        : 0,
      doneCount,
      dots,
      segments: raceSegments(dots)
    };
  });

  lanes.sort((left, right) =>
    right.doneCount - left.doneCount ||
    STATUS_RANK[right.tone] - STATUS_RANK[left.tone] ||
    right.revisionVersion - left.revisionVersion ||
    // Same stage and status: every stage deadline moves with the extension, so more days means more time left.
    right.extensionDays - left.extensionDays ||
    left.topic.localeCompare(right.topic)
  );

  let place = 1;
  for (let index = 0; index < lanes.length; index += 1) {
    if (index > 0 && !sameStanding(lanes[index], lanes[index - 1])) {
      place = index + 1;
    }
    lanes[index].place = place;
  }

  return lanes;
}

export function deadlineWhen(daysUntil: number) {
  if (daysUntil <= 0) return "Today";
  if (daysUntil === 1) return "1d";
  return `${daysUntil}d`;
}

function deadlineDateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  const key = (typeof value === "string" ? value : value.toISOString()).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function daysUntilDate(today: string, dateKey: string) {
  const start = parseDateKeyUtc(today).getTime();
  const end = parseDateKeyUtc(dateKey).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function classBoardReviewDates(finalCut: Date | string | null) {
  // Class Board reminders only; these do not change the graded Initial Cut deadline.
  const finalCutDate = deadlineDateKey(finalCut);
  return {
    initialCutStage2: finalCutDate ? addDaysToDateKey(finalCutDate, -7) : null,
    initialCutStage3: finalCutDate ? addDaysToDateKey(finalCutDate, -3) : null
  };
}

export function buildBoardDeadlines(
  cycles: Array<{
    cycleNumber: number;
    pitching: Date | string | null;
    proofOfContact: Date | string | null;
    aRollBRoll: Date | string | null;
    initialCut: Date | string | null;
    finalCut: Date | string | null;
  }>,
  today: string
): ClassBoardDeadline[] {
  const deadlines: Array<ClassBoardDeadline & { order: number }> = [];
  for (const cycle of cycles) {
    const dates = { ...cycle, ...classBoardReviewDates(cycle.finalCut) };
    DEADLINE_FIELDS.forEach((field, order) => {
      const dateKey = deadlineDateKey(dates[field.key]);
      if (!dateKey) return;
      const daysUntil = daysUntilDate(today, dateKey);
      if (daysUntil < 0) return;
      deadlines.push({
        id: `${cycle.cycleNumber}-${field.key}`,
        cycleNumber: cycle.cycleNumber,
        label: field.label,
        dateKey,
        daysUntil,
        when: deadlineWhen(daysUntil),
        focus: field.focus,
        order
      });
    });
  }

  return deadlines
    .sort((left, right) => left.daysUntil - right.daysUntil || left.cycleNumber - right.cycleNumber || left.order - right.order)
    .slice(0, CLASS_BOARD_DEADLINE_LIMIT)
    .map((deadline) => ({
      id: deadline.id,
      cycleNumber: deadline.cycleNumber,
      label: deadline.label,
      dateKey: deadline.dateKey,
      daysUntil: deadline.daysUntil,
      when: deadline.when,
      focus: deadline.focus
    }));
}

export function openSlotLabel(open: number) {
  if (open <= 0) return "Full";
  if (open === 1) return "1 open";
  return `${open} open`;
}

export function classBoardLiveFocus(
  board: Pick<ClassBoardModel, "classSessions" | "days" | "deadlines">,
  now: Date
) {
  const today = pacificDateKey(now);
  const day = board.days.find((item) => item.date === today);
  if (!day || day.kind === "HOLIDAY") return null;
  const session = board.classSessions.find((item) =>
    item.date === today && Date.parse(item.startsAt) <= now.getTime() && now.getTime() < Date.parse(item.endsAt)
  );
  if (!session) return null;
  const remainingMs = Date.parse(session.endsAt) - now.getTime();
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const deadline = board.deadlines.filter((item) => item.dateKey >= today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.cycleNumber - b.cycleNumber)[0];
  const daysUntil = deadline ? daysUntilDate(today, deadline.dateKey) : null;
  const due = daysUntil === 0 ? "Due today" : daysUntil === 1 ? "Due tomorrow" : `Due in ${daysUntil}d`;
  return {
    text: deadline?.focus ?? "Plan your next package steps",
    detail: deadline ? `Cycle ${deadline.cycleNumber} · ${due}` : "Period 1 · Class focus",
    remainingSeconds,
    countdown: `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`,
    remainingFraction: remainingMs / (Date.parse(session.endsAt) - Date.parse(session.startsAt))
  };
}

export type BoardLivestreamInput = {
  id: string;
  title: string;
  startsAt: string;
  location: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  availability: keyof typeof LIVESTREAM_AVAILABILITY_LABELS;
  capacity: number;
  attendeeNames: string[];
};

export function buildBoardLivestreams(
  events: BoardLivestreamInput[],
  window: { start: Date; until: Date },
  now = new Date()
): ClassBoardLivestream[] {
  return events
    .filter((event) => {
      if (event.status !== "SCHEDULED") return false;
      const starts = new Date(event.startsAt).getTime();
      return starts >= window.start.getTime() && starts < window.until.getTime();
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .map((event) => {
      const starts = new Date(event.startsAt);
      const dateKey = pacificDateKey(starts);
      const day = formatBoardDay(dateKey);
      const open = Math.max(0, event.capacity - event.attendeeNames.length);
      const crew = event.attendeeNames.map((name) => firstDisplayName(name)).filter(Boolean);
      return {
        id: event.id,
        dateKey,
        dayLabel: `${day.weekday.charAt(0)}${day.weekday.slice(1).toLowerCase()}, ${day.month} ${day.dayNum}`,
        timeLabel: new Intl.DateTimeFormat("en-US", {
          timeZone: CLASS_BOARD_TIME_ZONE,
          hour: "numeric",
          minute: "2-digit"
        }).format(starts),
        started: starts.getTime() < now.getTime(),
        title: event.title.trim() || "Livestream",
        where: event.location.trim(),
        crew: crew.length > 0 ? crew.join(", ") : "Crew open",
        openLabel: openSlotLabel(open),
        tone: capacityTone(event.attendeeNames.length, event.capacity),
        availability: LIVESTREAM_AVAILABILITY_LABELS[event.availability]
      };
    });
}

export function scheduleKindLabel(kind: ScheduleKind, label: string) {
  if (kind === "SHOW") return "Show";
  if (kind === "PA") return "PA";
  if (kind === "HOLIDAY") return label.trim() || "No school";
  return "Class";
}

export type BoardDayInput = {
  today: string;
  end: string;
  schedule: Array<{ date: string; kind: ScheduleKind; label: string }>;
  entries: Array<{ date: string; content: string }>;
  showManagers: Record<string, { name: string } | undefined>;
  queued: Array<{ date: string | null; title: string }>;
};

export function buildBoardDays(input: BoardDayInput): ClassBoardDay[] {
  const contentByDate = new Map(input.entries.map((entry) => [entry.date, entry.content]));
  const queuedByDate = new Map<string, string[]>();
  for (const item of input.queued) {
    if (!item.date) continue;
    const titles = queuedByDate.get(item.date) ?? [];
    titles.push(item.title.trim() || "Untitled package");
    queuedByDate.set(item.date, titles);
  }

  return input.schedule
    .filter((day) => day.date >= input.today && day.date < input.end)
    .map((day) => {
      const content = contentByDate.get(day.date) ?? "";
      const formatted = formatBoardDay(day.date);
      const lines: string[] = [];
      if (day.kind === "SHOW") {
        const anchors = extractCalendarAnchors(content);
        const manager = input.showManagers[day.date]?.name?.trim() || extractCalendarShowManager(content);
        if (anchors.length > 0) lines.push(`Anchors  ${anchors.join(" · ")}`);
        if (manager) lines.push(`Manager  ${manager}`);
      }
      if (day.kind === "PA") {
        const announcers = extractCalendarPaAnnouncers(content);
        if (announcers.length > 0) lines.push(`Announcers  ${announcers.join(" · ")}`);
      }
      const packages = queuedByDate.get(day.date) ?? [];
      if (packages.length > 0) lines.push(`On air  ${packages.join(" · ")}`);
      if (day.kind === "NONE" && day.label.trim()) lines.push(day.label.trim());

      return {
        date: day.date,
        weekday: formatted.weekday,
        dayNum: formatted.dayNum,
        kind: day.kind,
        kindLabel: scheduleKindLabel(day.kind, day.label),
        lines
      };
    });
}
