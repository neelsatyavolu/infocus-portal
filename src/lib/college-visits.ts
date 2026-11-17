import { dateKeyToIso } from "@/src/lib/announcement-submission";
import { addDaysToDateKey, parseDateKeyUtc } from "@/src/lib/show-assignment";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

export const COLLEGE_VISITS_SPREADSHEET_ID = "1vFHH91EE9F1WxEQ13c9l-5ynu_wHVIvy6A1ToHwiTFI";
export const COLLEGE_VISIT_RSVP_LINE =
  "Students can RSVP in MaiaLearning through ClassLink under Events.";

export type CollegeVisit = {
  college: string;
  topic: string;
  location: string;
  dateKey: string;
  time: string;
};

const SKIP_SHEET_TITLES = new Set(["sample"]);

export function collegeVisitsSpreadsheetId() {
  return process.env.GOOGLE_SHEETS_COLLEGE_VISITS_SPREADSHEET_ID?.trim() || COLLEGE_VISITS_SPREADSHEET_ID;
}

export function shouldSkipCollegeVisitSheet(title: string) {
  return SKIP_SHEET_TITLES.has(title.trim().toLowerCase());
}

/**
 * A date written without a year ("11/18") takes the year that puts it closest to
 * `referenceDateKey`; without a reference it is unreadable.
 */
export function parseCollegeVisitDate(value: string, referenceDateKey?: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return trimmed;
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!slash) {
    return null;
  }

  const month = Number(slash[1]);
  const day = Number(slash[2]);
  if (!slash[3]) {
    return referenceDateKey && validMonthDay(month, day) ? nearestYearDateKey(month, day, referenceDateKey) : null;
  }

  let year = Number(slash[3]);
  if (slash[3].length === 2) {
    year += year < 50 ? 2000 : 1900;
  }

  if (!validMonthDay(month, day)) {
    return null;
  }

  return toDateKey(year, month, day);
}

function validMonthDay(month: number, day: number) {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function toDateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HALF_YEAR_DAYS = 183;

function nearestYearDateKey(month: number, day: number, referenceDateKey: string) {
  const year = Number(referenceDateKey.slice(0, 4));
  const candidate = toDateKey(year, month, day);
  if (candidate < addDaysToDateKey(referenceDateKey, -HALF_YEAR_DAYS)) {
    return toDateKey(year + 1, month, day);
  }

  if (candidate > addDaysToDateKey(referenceDateKey, HALF_YEAR_DAYS)) {
    return toDateKey(year - 1, month, day);
  }

  return candidate;
}

export function isVirtualCollegeVisit(location: string) {
  const normalized = location.trim().toLowerCase();
  return normalized.includes("virtual") || normalized.includes("zoom") || normalized.includes("online");
}

export function isOnCampusCollegeVisit(location: string) {
  const normalized = location.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("virtual") ||
    normalized.includes("zoom") ||
    normalized.includes("online") ||
    normalized.includes("off campus") ||
    normalized.includes("off-campus")
  ) {
    return false;
  }

  return normalized.includes("paly");
}

export function parseCollegeVisitRows(rows: unknown[][], referenceDateKey?: string): CollegeVisit[] {
  const visits: CollegeVisit[] = [];
  const seen = new Set<string>();

  for (const rawRow of rows) {
    const college = cell(rawRow[0]);
    const topic = cell(rawRow[1]);
    const location = cell(rawRow[2]);
    const dateValue = cell(rawRow[3]);
    const time = cell(rawRow[4]);

    if (!college || /^college$/i.test(college) || /^week of\b/i.test(college) || /^note:/i.test(college)) {
      continue;
    }

    const dateKey = parseCollegeVisitDate(dateValue, referenceDateKey);
    if (!dateKey) {
      continue;
    }

    const visit: CollegeVisit = {
      college: college.replace(/^"+|"+$/g, "").trim(),
      topic,
      location,
      dateKey,
      time
    };
    const key = `${visit.dateKey}|${visit.time.toLowerCase()}|${visit.college.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    visits.push(visit);
  }

  return visits;
}

export function visitsInShowWindow(visits: CollegeVisit[], showDateKey: string, nextShowDateKey: string) {
  return visits
    .filter((visit) => visit.dateKey >= showDateKey && visit.dateKey < nextShowDateKey)
    .sort((left, right) => {
      if (left.dateKey !== right.dateKey) {
        return left.dateKey.localeCompare(right.dateKey);
      }

      return spokenTimeSortValue(left.time) - spokenTimeSortValue(right.time);
    });
}

export function isCollegeVisitAnnouncementText(value: string) {
  return /\bcollege\s+(?:(?:rep|representative)s?\.?\s+)?visits?\b/i.test(value);
}

export function collegeVisitAnnouncementId(showDateKey: string) {
  return `college-visits-${showDateKey}`;
}

export function makeCollegeVisitAnnouncement(params: {
  showDateKey: string;
  text: string;
}): SubmittedAnnouncement {
  const { showDateKey, text } = params;
  return {
    id: collegeVisitAnnouncementId(showDateKey),
    rowNumber: Number.MAX_SAFE_INTEGER,
    timestamp: "",
    timestampIso: dateKeyToIso(showDateKey),
    name: "College & Career Center",
    email: "",
    category: "InFocus only",
    submitterKind: "PAUSD_EMPLOYEE",
    runOn: "INFOCUS_ONLY",
    announcement: text,
    startDate: showDateKey,
    startDateIso: dateKeyToIso(showDateKey),
    endDate: showDateKey,
    endDateIso: dateKeyToIso(showDateKey),
    mediaLink: "",
    moreInfo: "",
    source: "google-sheets"
  };
}

export function mergeCollegeVisitIntoBulletin(
  selected: SubmittedAnnouncement[],
  collegeVisit: SubmittedAnnouncement | null,
  limit = 4
) {
  if (!collegeVisit) {
    return selected.slice(0, limit);
  }

  const rest = selected.filter((announcement) => !isCollegeVisitAnnouncementText(announcement.announcement));
  return [collegeVisit, ...rest].slice(0, limit);
}

export function draftCollegeVisitAnnouncement(visits: CollegeVisit[], showDateKey: string) {
  if (visits.length === 0) {
    return null;
  }

  const campus = visits.filter((visit) => isOnCampusCollegeVisit(visit.location));
  const events = draftOtherEvents(
    visits.filter((visit) => !isOnCampusCollegeVisit(visit.location)),
    showDateKey,
    campus.length > 0
  );
  if (campus.length === 0) {
    return `${events} ${COLLEGE_VISIT_RSVP_LINE}`;
  }

  if (campus.length <= 3) {
    return [draftNamedVisits(campus, showDateKey), events, COLLEGE_VISIT_RSVP_LINE].filter(Boolean).join(" ");
  }

  return draftGroupedVisits(campus, showDateKey, events);
}

const MAX_NAMED_OTHER_EVENTS = 3;

/** Off-campus and virtual events: each one named with its day, time and place, or a count when there are many. */
function draftOtherEvents(events: CollegeVisit[], showDateKey: string, afterCampusVisits: boolean) {
  if (events.length === 0) {
    return "";
  }

  if (events.length > MAX_NAMED_OTHER_EVENTS) {
    const also = afterCampusVisits ? "also " : "";
    return `There are ${also}${events.length} off-campus and virtual college events coming up.`;
  }

  return events
    .map((event) => {
      const when = [dayPhrase(event.dateKey, showDateKey), timePhrase(event.time)].filter(Boolean).join(" ");
      const place = placeName(event.location);
      const where = isVirtualCollegeVisit(event.location) ? "online" : place ? `at ${place}` : "";
      return sentence([`${event.college} is`, when, where].filter(Boolean).join(" "));
    })
    .join(" ");
}

// "Saratoga High School 20300 Herriman Ave ..." reads on air as "Saratoga High School".
function placeName(location: string) {
  return location.replace(/\s+\d.*$/, "").replace(/,\s*$/, "").trim();
}

function draftGroupedVisits(visits: CollegeVisit[], showDateKey: string, events: string) {
  const span = formatVisitSpan(visits, showDateKey);
  const days = [...new Set(visits.map((visit) => visit.dateKey))];
  const groups = days.map((dateKey) => {
    const day = spanDay(dateKey, showDateKey);
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    const names = visits.filter((visit) => visit.dateKey === dateKey).map((visit) => visit.college);
    return `${label}’s visitors are ${joinAnd(names)}.`;
  });
  const middle = [groups.join(" "), events].filter(Boolean).join(" ");
  return `College visits are happening ${span} in the College and Career Center. ${middle} Check MaiaLearning through ClassLink under Events for visit times and to RSVP.`;
}

export function formatSpokenClock(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (!match) {
    return value.trim();
  }

  const hour = String(Number(match[1]));
  const minutes = match[2] ?? "00";
  const period = match[3].toLowerCase() === "a" ? "a.m." : "p.m.";
  return `${hour}:${minutes} ${period}`;
}

function draftNamedVisits(visits: CollegeVisit[], showDateKey: string) {
  if (visits.length === 1) {
    const visit = visits[0];
    const when = [dayPhrase(visit.dateKey, showDateKey), timePhrase(visit.time)].filter(Boolean).join(" ");
    return sentence(`${visit.college} will be visiting the College and Career Center ${when}`);
  }

  const sameDay = visits.every((visit) => visit.dateKey === visits[0].dateKey);
  if (sameDay) {
    const names = joinAnd(visits.map((visit) => visit.college));
    const day = dayPhrase(visits[0].dateKey, showDateKey);
    const timed = visits.filter((visit) => visit.time);
    if (timed.length !== visits.length) {
      return `${names} will be visiting the College and Career Center ${day}.`;
    }

    const times = joinAnd(timed.map((visit) => `${visit.college} is at ${formatSpokenClock(visit.time)}`));
    return `${names} will be visiting the College and Career Center ${day}. ${sentence(times)}`;
  }

  const clauses = visits.map((visit, index) => {
    const when = [dayPhrase(visit.dateKey, showDateKey), timePhrase(visit.time)].filter(Boolean).join(" ");
    if (index === 0) {
      return `${visit.college} will be visiting the College and Career Center ${when}`;
    }

    return `${visit.college} ${when}`;
  });

  return sentence(joinAnd(clauses));
}

// Spoken clocks already end in "a.m." or "p.m.", which closes the sentence.
function sentence(text: string) {
  return text.endsWith(".") ? text : `${text}.`;
}

function formatVisitSpan(visits: CollegeVisit[], showDateKey: string) {
  const dates = [...new Set(visits.map((visit) => visit.dateKey))];
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) {
    return dayPhrase(first, showDateKey);
  }

  const start = spanDay(first, showDateKey);
  const end = spanDay(last, showDateKey);
  if (start === "today" && end === "tomorrow") {
    return "today and tomorrow";
  }

  return `${start} through ${end}`;
}

function spanDay(dateKey: string, showDateKey: string) {
  if (dateKey === showDateKey) {
    return "today";
  }

  if (addDaysToDateKey(showDateKey, 1) === dateKey) {
    return "tomorrow";
  }

  return weekdayName(dateKey);
}

function weekdayName(dateKey: string) {
  return parseDateKeyUtc(dateKey).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC"
  });
}

function dayPhrase(dateKey: string, showDateKey: string) {
  if (dateKey === showDateKey) {
    return "today";
  }

  if (addDaysToDateKey(showDateKey, 1) === dateKey) {
    return "tomorrow";
  }

  return `on ${weekdayName(dateKey)}`;
}

function timePhrase(value: string) {
  const spoken = formatSpokenClock(value);
  return spoken ? `at ${spoken}` : "";
}

function spokenTimeSortValue(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (!match) {
    return 0;
  }

  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "p") {
    hour += 12;
  }

  return hour * 60 + Number(match[2] ?? "0");
}

function joinAnd(items: string[]) {
  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function cell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
