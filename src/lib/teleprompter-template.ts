import { announcementShowDates, isSchoologyOnly, toDateKey as announcementDateKey } from "@/src/lib/announcement-submission";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

export const TELEPROMPTER_TIME_ZONE = "America/Los_Angeles";

/** Shows air Wednesday and Friday (2026–27). */
const SHOW_WEEKDAYS = new Set(["Wed", "Fri"]);
const A2_SLOTS = [
  { camera: "CAM 3", role: "[ANCHOR]" },
  { camera: "CAM 1", role: "[CO-ANCHOR]" },
  { camera: "CAM 3", role: "[ANCHOR]" },
  { camera: "CAM 1", role: "[CO-ANCHOR]" }
] as const;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DefaultTeleprompterSection = {
  label: string;
  content: string;
  orderIndex: number;
};

function getDatePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);

  return { year, month, day };
}

function toDateKey(date: Date, timeZone: string) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function dateKeyToEpochDay(dateKey: string) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00.000Z`) / 86_400_000);
}

function ordinalSuffix(day: number) {
  const mod10 = day % 10;
  const mod100 = day % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "st";
  }

  if (mod10 === 2 && mod100 !== 12) {
    return "nd";
  }

  if (mod10 === 3 && mod100 !== 13) {
    return "rd";
  }

  return "th";
}

export function getNextShowDate(now = new Date(), timeZone = TELEPROMPTER_TIME_ZONE): Date {
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = new Date(now);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short"
    }).format(candidate);

    if (!SHOW_WEEKDAYS.has(weekday)) {
      continue;
    }

    return dateFromKey(toDateKey(candidate, timeZone));
  }

  throw new Error("Unable to compute next show date.");
}

export function formatShowDateForDocTitle(showDate: Date, timeZone = TELEPROMPTER_TIME_ZONE) {
  const { year, month, day } = getDatePartsInTimeZone(showDate, timeZone);
  return `${month}/${day}/${year}`;
}

export function formatShowDateForScriptLine(showDate: Date, timeZone = TELEPROMPTER_TIME_ZONE) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long"
  }).format(showDate);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long"
  }).format(showDate);
  const { day, year } = getDatePartsInTimeZone(showDate, timeZone);
  return `${weekday}, ${month} ${day}${ordinalSuffix(day)}, ${year}`;
}

export function selectAnnouncementsForBulletin(params: {
  announcements: SubmittedAnnouncement[];
  showDate: Date;
  limit?: number;
  timeZone?: string;
  pa?: boolean;
}) {
  const { announcements, showDate, limit = 4, timeZone = TELEPROMPTER_TIME_ZONE } = params;
  const showDateKey = toDateKey(showDate, timeZone);
  const showEpochDay = dateKeyToEpochDay(showDateKey);

  return announcements
    .map((announcement) => {
      if (isSchoologyOnly(announcement)) {
        return null;
      }

      if (announcement.isPermanent) {
        return { announcement, dayDelta: Number.MAX_SAFE_INTEGER };
      }

      if (params.pa) {
        const end = announcementDateKey(announcement.endDate, announcement.endDateIso);
        const start = announcementDateKey(announcement.startDate, announcement.startDateIso) ?? end;
        if (!start || !end || showDateKey < start || showDateKey > end) return null;
        return { announcement, dayDelta: dateKeyToEpochDay(end) - showEpochDay };
      }

      const shows = announcementShowDates(announcement);
      if (!shows.includes(showDateKey)) {
        return null;
      }

      const lastShow = shows[shows.length - 1];
      return {
        announcement,
        dayDelta: dateKeyToEpochDay(lastShow) - showEpochDay
      };
    })
    .filter((entry): entry is { announcement: SubmittedAnnouncement; dayDelta: number } => entry !== null)
    .sort((left, right) => {
      if (left.dayDelta !== right.dayDelta) {
        return left.dayDelta - right.dayDelta;
      }

      return right.announcement.rowNumber - left.announcement.rowNumber;
    })
    .slice(0, limit)
    .map((entry) => entry.announcement);
}

export function renderA2BulletinContent(announcements: SubmittedAnnouncement[]) {
  if (announcements.length === 0) {
    return "";
  }

  return announcements
    .map((announcement, index) => {
      const slot = A2_SLOTS[index % A2_SLOTS.length];
      return `${slot.camera}\n${slot.role}\n${announcement.announcement.trim()}`;
    })
    .join("\n\n");
}

export function renderA2UnavailableContent() {
  return A2_SLOTS.map((slot) => `${slot.camera}\n${slot.role}`).join("\n\n");
}

export function buildDefaultTeleprompterSections(params: {
  showDate: Date;
  a2BulletinContent: string;
  anchorName?: string | null;
  coanchorName?: string | null;
}): DefaultTeleprompterSection[] {
  const { showDate, a2BulletinContent, anchorName, coanchorName } = params;
  const dateLine = formatShowDateForScriptLine(showDate);
  const anchorIntro = anchorName?.trim() || "{ANCHOR NAME}";
  const coanchorIntro = coanchorName?.trim() || "{COANCHOR NAME}";

  const a2Body = a2BulletinContent ? `BULLETIN\n\n${a2BulletinContent}` : "BULLETIN";

  return [
    {
      label: "A1",
      orderIndex: 0,
      content: `OPEN

{ROLL INTRO}

{HOLD}

CAM 2
{ANCHOR}
Good Morning PALY!
{COANCHOR}
Today is ${dateLine}.
{ANCHOR}
I'm ${anchorIntro}.
{COANCHOR}
And I'm ${coanchorIntro}.
BANTER ABOUT...`
    },
    {
      label: "A2",
      orderIndex: 1,
      content: a2Body
    },
    {
      label: "A3",
      orderIndex: 2,
      content: `PACKAGE

CAM 2
{COANCHOR}
[INSERT PACKAGE TOSS]

{ROLL PACKAGE}
{HOLD}`
    },
    {
      label: "A4",
      orderIndex: 3,
      content: `BULLETIN

CAM 2
{COANCHOR}
[INSERT THANK YOU NAMES]`
    },
    {
      label: "A5",
      orderIndex: 4,
      content: `CLOSING

CAM 2
{COANCHOR}
That does it for today's show.
{ANCHOR}
Follow us on social media @infocusnews to engage with our content, and visit our website at infocusnews.tv to watch more InFocus shows, livestreams, and packages. Also, make sure to subscribe to our YouTube channel so you never miss our latest content!
{CO ANCHOR}
Until next time, I'm ${coanchorIntro}.
{ANCHOR}
I'm ${anchorIntro} and this has been InFocus News.
{CO ANCHOR}
Have a Great Day Vikings!

{ROLL OUTRO}
{HOLD}`
    }
  ];
}
