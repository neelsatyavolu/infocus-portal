import { resolveScheduleDay, type ScheduleKind } from "@/src/lib/school-schedule";
import { addDaysToDateKey } from "@/src/lib/show-assignment";

// The supported 2026–27 school calendar; do not invent summer PA dates.
export const PA_CALENDAR_START = "2026-08-13";
export const PA_CALENDAR_END = "2027-06-03";

export function paToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

export function nextPaDate(
  now = new Date(),
  overrides?: ReadonlyMap<string, { kind: ScheduleKind; label?: string }>
) {
  const today = paToday(now);
  for (let date = today < PA_CALENDAR_START ? PA_CALENDAR_START : today; date <= PA_CALENDAR_END; date = addDaysToDateKey(date, 1)) {
    if (resolveScheduleDay(date, overrides).kind === "PA") return date;
  }
  return null;
}

// PA is read at the start of second period, except on Mondays that run a different bell schedule.
const PA_PERIOD_EXCEPTIONS: Readonly<Record<string, string>> = {
  "2026-09-28": "fifth" // Friday (5–7) schedule on a Monday
};

export function paTimeLabel(date: string) {
  return `Start of ${PA_PERIOD_EXCEPTIONS[date] ?? "second"} period`;
}

export function paDateLabel(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric"
  }).format(value).replace(`${day},`, `${day}${suffix},`);
}

type PaPerson = { id: string; name: string | null; nickname: string | null };
const normalized = (value: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Resolve identity conservatively: ambiguous calendar names never grant editing access. */
export function resolvePaPeople(rawNames: string[], users: PaPerson[]) {
  return rawNames.slice(0, 2).map((raw) => {
    const key = normalized(raw);
    if (!key) return null;
    for (const match of [
      (user: PaPerson) => normalized(user.name) === key,
      (user: PaPerson) => normalized(user.nickname) === key,
      (user: PaPerson) => normalized(user.name).split(" ")[0] === key || normalized(user.nickname).split(" ")[0] === key
    ]) {
      const matches = users.filter(match);
      if (matches.length) return matches.length === 1 ? matches[0] : null;
    }
    return null;
  });
}

function nameLines(names: string[]) {
  const anchor = names[0] || "[anchor name]";
  const coanchor = names[1] || "[co-anchor name]";
  return [
    `Anchor: Good morning, PALY! I'm ${anchor}.`,
    `Co-Anchor: And I'm ${coanchor}.`,
    `Co-Anchor: That's all for today. I'm ${coanchor}.`,
    `Anchor: I'm ${anchor} and this has been InFocus News.`
  ];
}

export function buildPaScript(date: string, names: string[], announcements?: string[]) {
  const lines = nameLines(names);
  return [
    lines[0], lines[1], `Anchor: Today is ${paDateLabel(date)}.`,
    ...(announcements?.length
      ? announcements.map((text, index) => `${index % 2 === 0 ? "Co-Anchor" : "Anchor"}: ${text}`)
      : ["Co-Anchor: [announcement]", "Anchor: [announcement]",
        "Co-Anchor: [announcement]", "Anchor: [announcement]",
        "Co-Anchor: [optional short announcement]"]),
    lines[2], lines[3], "Co-Anchor: Have a fantastic day, Vikings!"
  ].join("\n\n");
}

export function refreshPaNames(content: string, previous: string[], next: string[]) {
  const replacements = new Map(nameLines(previous).map((line, index) => [line, nameLines(next)[index]]));
  return content.split("\n").map((line) => replacements.get(line) ?? line).join("\n");
}
