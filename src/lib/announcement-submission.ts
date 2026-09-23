import { z } from "zod";
import { resolveScheduleDay } from "@/src/lib/school-schedule";
import {
  addDaysToDateKey,
  DATE_KEY_PATTERN,
  FIRST_SHOW_DATE,
  formatShowDateShort,
  listUpcomingShowDates
} from "@/src/lib/show-assignment";

export const ANNOUNCEMENT_TIME_ZONE = "America/Los_Angeles";
export const MAX_SHOW_DAYS = 4;

export const SUBMITTER_KIND_OPTIONS = [
  { value: "PALY_STUDENT", label: "PALY Student" },
  { value: "PAUSD_EMPLOYEE", label: "PAUSD Employee" },
  { value: "PARENT_GUARDIAN", label: "Parent/Guardian of a PALY Student" },
  { value: "COMMUNITY_MEMBER", label: "Palo Alto Community member" }
] as const;

export const RUN_ON_OPTIONS = [
  { value: "INFOCUS_ONLY", label: "InFocus only" },
  { value: "SCHOOLOGY_ONLY", label: "Schoology Update only" },
  { value: "BOTH", label: "Both" }
] as const;

export type SubmitterKind = (typeof SUBMITTER_KIND_OPTIONS)[number]["value"];
export type RunOn = (typeof RUN_ON_OPTIONS)[number]["value"];
export type AirTone = "today" | "tomorrow" | "upcoming" | "ended" | "schoology" | "neutral";

export type AirWindow = {
  label: string;
  tone: AirTone;
  airsToday: boolean;
  airsTomorrow: boolean;
};

const submitterKindValues = SUBMITTER_KIND_OPTIONS.map((option) => option.value) as [SubmitterKind, ...SubmitterKind[]];
const runOnValues = RUN_ON_OPTIONS.map((option) => option.value) as [RunOn, ...RunOn[]];

function isDateKey(value: string) {
  return DATE_KEY_PATTERN.test(value);
}

export const announcementSubmitSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email."),
    name: z.string().trim().min(1, "Name is required.").max(120),
    submitterKind: z.enum(submitterKindValues),
    runOn: z.enum(runOnValues),
    announcement: z.string().trim().min(1, "Announcement text is required.").max(4000),
    startDate: z.string().regex(DATE_KEY_PATTERN, "Start date is required."),
    endDate: z.string().regex(DATE_KEY_PATTERN, "End date is required."),
    policyAgreed: z.literal(true, {
      errorMap: () => ({ message: "You must agree to the InFocus announcement policy." })
    }),
    mediaLink: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined)
      .refine((value) => !value || /^https?:\/\//i.test(value), "Media link must be a full URL."),
    moreInfo: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined)
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date cannot be before the start date."
      });
      return;
    }

    if (showDatesInRange(value.startDate, value.endDate).length > MAX_SHOW_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: `Announcements can run for at most ${MAX_SHOW_DAYS} consecutive show days.`
      });
    }
  });

export type AnnouncementSubmitInput = z.infer<typeof announcementSubmitSchema>;

export function dateKeyInTimeZone(now = new Date(), timeZone = ANNOUNCEMENT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function dateKeyToIso(dateKey: string) {
  if (!isDateKey(dateKey)) {
    return null;
  }

  return `${dateKey}T12:00:00.000Z`;
}

export function toDateKey(value: string | null | undefined, iso?: string | null) {
  const trimmed = (value ?? "").trim();
  if (isDateKey(trimmed)) {
    return trimmed;
  }

  if (iso && isDateKey(iso.slice(0, 10))) {
    return iso.slice(0, 10);
  }

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function showDatesInRange(startDate: string, endDate: string) {
  if (!isDateKey(startDate) || !isDateKey(endDate) || endDate < startDate) {
    return [];
  }

  const shows: string[] = [];
  let key = startDate < FIRST_SHOW_DATE ? FIRST_SHOW_DATE : startDate;
  if (key > endDate) {
    return [];
  }

  for (let step = 0; step < 180 && key <= endDate; step += 1) {
    if (resolveScheduleDay(key).kind === "SHOW") {
      shows.push(key);
    }
    key = addDaysToDateKey(key, 1);
  }

  return shows;
}

export function maxAnnouncementEndDate(startDate: string) {
  if (!isDateKey(startDate)) {
    return null;
  }

  const shows = listUpcomingShowDates(startDate, MAX_SHOW_DAYS);
  return shows[MAX_SHOW_DAYS - 1] ?? shows.at(-1) ?? null;
}

export function announcementShowDates(params: {
  startDate?: string | null;
  startDateIso?: string | null;
  endDate?: string | null;
  endDateIso?: string | null;
}) {
  const start = toDateKey(params.startDate, params.startDateIso);
  const end = toDateKey(params.endDate, params.endDateIso);
  if (start && end) {
    return showDatesInRange(start, end);
  }
  if (end) {
    return showDatesInRange(end, end);
  }
  return [];
}

export function announcementCoversShowDate(
  params: {
    startDate?: string | null;
    startDateIso?: string | null;
    endDate?: string | null;
    endDateIso?: string | null;
    runOn?: string | null;
    category?: string | null;
  },
  showDateKey: string
) {
  if (isSchoologyOnly(params)) {
    return false;
  }

  return announcementShowDates(params).includes(showDateKey);
}

export function submitterKindLabel(value: string | null | undefined) {
  return SUBMITTER_KIND_OPTIONS.find((option) => option.value === value)?.label ?? value ?? "";
}

export function runOnLabel(value: string | null | undefined) {
  return RUN_ON_OPTIONS.find((option) => option.value === value)?.label ?? value ?? "";
}

export function isSchoologyOnly(params: { runOn?: string | null; category?: string | null }) {
  if (params.runOn === "SCHOOLOGY_ONLY") {
    return true;
  }

  return (params.category ?? "").trim().toLowerCase() === "schoology update only";
}

function formatAirDate(dateKey: string) {
  return formatShowDateShort(dateKey);
}

export function airWindowFor(params: {
  isPermanent?: boolean;
  startDate?: string | null;
  startDateIso?: string | null;
  endDate?: string | null;
  endDateIso?: string | null;
  runOn?: string | null;
  category?: string | null;
  now?: Date;
}): AirWindow {
  if (isSchoologyOnly(params)) {
    return {
      label: "Schoology only",
      tone: "schoology",
      airsToday: false,
      airsTomorrow: false
    };
  }

  if (params.isPermanent) {
    const today = dateKeyInTimeZone(params.now);
    const tomorrow = addDaysToDateKey(today, 1);
    return {
      label: "Permanent",
      tone: "upcoming",
      airsToday: showDatesInRange(today, today).length > 0,
      airsTomorrow: showDatesInRange(tomorrow, tomorrow).length > 0
    };
  }

  const start = toDateKey(params.startDate, params.startDateIso);
  const end = toDateKey(params.endDate, params.endDateIso);

  if (!start && !end) {
    return {
      label: "No date window",
      tone: "neutral",
      airsToday: false,
      airsTomorrow: false
    };
  }

  const today = dateKeyInTimeZone(params.now);
  const tomorrow = addDaysToDateKey(today, 1);
  const windowStart = start ?? end!;
  const windowEnd = end ?? start!;
  const shows = showDatesInRange(windowStart, windowEnd);
  const lastShow = shows.at(-1) ?? null;
  const nextShow = shows.find((dateKey) => dateKey >= today) ?? null;
  const todayInRange = shows.includes(today);
  const tomorrowInRange = shows.includes(tomorrow);

  if (shows.length === 0) {
    return {
      label: today > windowEnd ? "Window ended" : "No show in range",
      tone: today > windowEnd ? "ended" : "neutral",
      airsToday: false,
      airsTomorrow: false
    };
  }

  if (lastShow && today > lastShow) {
    return {
      label: "Window ended",
      tone: "ended",
      airsToday: false,
      airsTomorrow: false
    };
  }

  if (todayInRange) {
    return {
      label: "Will air today",
      tone: "today",
      airsToday: true,
      airsTomorrow: tomorrowInRange
    };
  }

  if (tomorrowInRange) {
    return {
      label: "Will air tomorrow",
      tone: "tomorrow",
      airsToday: false,
      airsTomorrow: true
    };
  }

  return {
    label: `Will air ${formatAirDate(nextShow ?? shows[0])}`,
    tone: "upcoming",
    airsToday: false,
    airsTomorrow: false
  };
}

export type SubmittedAnnouncementBucketId = "permanent" | "today" | "tomorrow" | "upcoming" | "schoology" | "ended" | "other";

export const SUBMITTED_ANNOUNCEMENT_BUCKETS: {
  id: SubmittedAnnouncementBucketId;
  title: string;
  defaultOpen: boolean;
}[] = [
  { id: "permanent", title: "Permanent", defaultOpen: true },
  { id: "today", title: "Air today", defaultOpen: true },
  { id: "tomorrow", title: "Air tomorrow", defaultOpen: true },
  { id: "upcoming", title: "Upcoming", defaultOpen: true },
  { id: "schoology", title: "Schoology only", defaultOpen: true },
  { id: "ended", title: "Ended", defaultOpen: false },
  { id: "other", title: "Other", defaultOpen: true }
];

type AnnouncementAirFields = {
  isPermanent?: boolean;
  startDate?: string | null;
  startDateIso?: string | null;
  endDate?: string | null;
  endDateIso?: string | null;
  runOn?: string | null;
  category?: string | null;
};

export function formatAnnouncementCopy(announcement: string) {
  return announcement.trim();
}

export function formatAnnouncementListCopy(announcements: string[]) {
  return announcements.map(formatAnnouncementCopy).filter(Boolean).join("\n\n");
}

export function submittedAnnouncementBucketId(
  params: AnnouncementAirFields & { now?: Date }
): SubmittedAnnouncementBucketId {
  if (params.isPermanent && !isSchoologyOnly(params)) return "permanent";
  const window = airWindowFor(params);
  if (window.airsToday) {
    return "today";
  }
  if (window.airsTomorrow) {
    return "tomorrow";
  }
  if (window.tone === "upcoming") {
    return "upcoming";
  }
  if (window.tone === "schoology") {
    return "schoology";
  }
  if (window.tone === "ended") {
    return "ended";
  }
  return "other";
}

export function groupSubmittedAnnouncements<T extends AnnouncementAirFields>(entries: T[], now?: Date) {
  const grouped = Object.fromEntries(
    SUBMITTED_ANNOUNCEMENT_BUCKETS.map((bucket) => [bucket.id, [] as T[]])
  ) as Record<SubmittedAnnouncementBucketId, T[]>;

  for (const entry of entries) {
    grouped[submittedAnnouncementBucketId({ ...entry, now })].push(entry);
  }

  return SUBMITTED_ANNOUNCEMENT_BUCKETS.map((bucket) => ({
    ...bucket,
    entries: grouped[bucket.id]
  })).filter((bucket) => bucket.entries.length > 0);
}
