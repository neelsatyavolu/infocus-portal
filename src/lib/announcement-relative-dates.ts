import { addDaysToDateKey } from "@/src/lib/show-assignment";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Optional "on" and weekday, then "October 30th" / "Oct. 30" / "10/30", then an optional year.
// A date followed by a range ("30th and 31st", "30-31") is left as written.
const CALENDAR_DATE_PATTERN =
  /\b(?:on\s+)?(?:(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day,?\s+)?(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})\/(\d{1,2}))(?:,?\s+(\d{4})|\/(\d{2}|\d{4}))?\b(?!\s*(?:-|–|and|through|to)\s*\d)/gi;

const SENTENCE_START = /(?:^|[.!?]\s+)$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Rewrites dates that fall on the show day or the day after as "today" / "tomorrow". */
export function relativizeShowDayDates(text: string, showDateKey: string) {
  const relative = new Map([
    [showDateKey, "today"],
    [addDaysToDateKey(showDateKey, 1), "tomorrow"]
  ]);

  return text.replace(
    CALENDAR_DATE_PATTERN,
    (match, monthName: string | undefined, monthDay, numericMonth, numericDay, longYear, slashYear, offset: number) => {
      const month = monthName ? MONTHS.indexOf(monthName.slice(0, 3).toLowerCase()) + 1 : Number(numericMonth);
      const day = Number(monthName ? monthDay : numericDay);
      const yearText: string | undefined = longYear ?? slashYear;
      const monthDayKey = `${pad(month)}-${pad(day)}`;

      const word = [...relative].find(([dateKey]) =>
        yearText
          ? dateKey === `${yearText.length === 2 ? `20${yearText}` : yearText}-${monthDayKey}`
          : dateKey.slice(5) === monthDayKey
      )?.[1];
      if (!word) {
        return match;
      }

      return SENTENCE_START.test(text.slice(0, offset)) ? word[0].toUpperCase() + word.slice(1) : word;
    }
  );
}
