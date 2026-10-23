/*
 * Turns one written word into the lowercase tokens a speech recognizer would write for it, so a
 * script word and a heard word compare equal. Digits are spelled out ("2026" → "twenty twenty
 * six", "23rd" → "twenty third"); feed recognizer output through the same function and both
 * sides meet in the spelled-out form. Pure: used by the follow-along aligner and its tests.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: Array<[number, string]> = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"]
];
const IRREGULAR_ORDINALS: Record<string, string> = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth"
};
/** Run-together words the show says as separate words. */
const SPLIT_WORDS: Record<string, string[]> = {
  infocus: ["in", "focus"],
  infocusnews: ["in", "focus", "news"]
};
const MAX_SPELLED_NUMBER = 999_999_999_999;

function underThousand(value: number): string[] {
  const words: string[] = [];
  let rest = value;
  if (rest >= 100) {
    words.push(ONES[Math.floor(rest / 100)], "hundred");
    rest %= 100;
  }
  if (rest >= 20) {
    words.push(TENS[Math.floor(rest / 10)]);
    rest %= 10;
  }
  if (rest > 0) {
    words.push(ONES[rest]);
  }
  return words;
}

export function numberToWords(value: number): string {
  if (value === 0) {
    return "zero";
  }

  const words: string[] = [];
  let rest = value;
  for (const [scale, name] of SCALES) {
    if (rest >= scale) {
      words.push(...underThousand(Math.floor(rest / scale)), name);
      rest %= scale;
    }
  }
  words.push(...underThousand(rest));
  return words.join(" ");
}

function ordinalWords(value: number): string {
  const words = numberToWords(value).split(" ");
  const last = words.pop() ?? "";
  const ordinal = IRREGULAR_ORDINALS[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return [...words, ordinal].join(" ");
}

/** 1999 → "nineteen ninety nine", 2026 → "twenty twenty six", 2005 → "two thousand five". */
function yearWords(year: number): string {
  if (year >= 2000 && year < 2010) {
    return numberToWords(year);
  }
  const high = Math.floor(year / 100);
  const low = year % 100;
  if (low === 0) {
    return `${numberToWords(high)} hundred`;
  }
  return `${numberToWords(high)} ${low < 10 ? `oh ${ONES[low]}` : numberToWords(low)}`;
}

function clockWords(hour: number, minute: number): string {
  if (minute === 0) {
    return numberToWords(hour);
  }
  return `${numberToWords(hour)} ${minute < 10 ? `oh ${ONES[minute]}` : numberToWords(minute)}`;
}

const WHOLE_NUMBER = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;

/** "1,500" → "one thousand five hundred", "3.5" → "three point five"; null past the limit. */
function cardinalWords(text: string): string | null {
  const match = text.match(new RegExp(`^${WHOLE_NUMBER}(?:\\.(\\d+))?$`));
  if (!match) {
    return null;
  }
  const value = Number(match[1].replace(/,/g, ""));
  if (value > MAX_SPELLED_NUMBER) {
    return null;
  }
  const fraction = match[2] ? ` point ${[...match[2]].map((digit) => ONES[Number(digit)]).join(" ")}` : "";
  return `${numberToWords(value)}${fraction}`;
}

/** Spelled-out words for a numeric word, or null when it isn't one. */
function numericWords(core: string): string | null {
  // "3:30", "5:00pm", "7am" (a.m./p.m. arrive without their trailing dot).
  const time = core.match(/^(\d{1,2})(?::(\d{2}))?(?:([ap])\.?m)?$/);
  if (time && (time[2] || time[3])) {
    const clock = clockWords(Number(time[1]), Number(time[2] ?? 0));
    return time[3] ? `${clock} ${time[3]}m` : clock;
  }

  const ordinal = core.match(new RegExp(`^${WHOLE_NUMBER}(st|nd|rd|th)$`));
  if (ordinal) {
    const value = Number(ordinal[1].replace(/,/g, ""));
    return value <= MAX_SPELLED_NUMBER ? ordinalWords(value) : null;
  }

  if (core.endsWith("%")) {
    const amount = cardinalWords(core.slice(0, -1));
    return amount ? `${amount} percent` : null;
  }

  if (/^\d{4}$/.test(core)) {
    const value = Number(core);
    if (value >= 1100 && value < 2100) {
      return yearWords(value);
    }
  }

  return cardinalWords(core);
}

function pieceTokens(piece: string): string[] {
  return piece
    .replace(/'/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .flatMap((part) => {
      const spelled = numericWords(part);
      if (spelled) {
        return spelled.split(" ");
      }
      return SPLIT_WORDS[part] ?? [part];
    });
}

export function normalizeSpokenWord(raw: string): string[] {
  const core = raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/&/g, " and ")
    .trim()
    .replace(/^[^\p{L}\p{N}@]+/u, "")
    .replace(/[^\p{L}\p{N}%]+$/u, "");

  if (!core) {
    return [];
  }

  if (core.startsWith("@")) {
    return ["at", ...normalizeSpokenWord(core.slice(1))];
  }

  // "a.m." / "p.m." (the trailing dot is already gone).
  const meridiem = core.match(/^([ap])\.m$/);
  if (meridiem) {
    return [`${meridiem[1]}m`];
  }

  const spelled = numericWords(core);
  if (spelled) {
    return spelled.split(" ");
  }

  // A web address ("infocusnews.tv") is read with "dot"; "U.S." is not an address.
  const dotted = core.split(".");
  if (dotted.length > 1 && dotted.every((part) => part.length >= 2)) {
    return dotted.flatMap((part, index) => (index === 0 ? pieceTokens(part) : ["dot", ...pieceTokens(part)]));
  }

  return core.split(/\s+/).flatMap(pieceTokens);
}
