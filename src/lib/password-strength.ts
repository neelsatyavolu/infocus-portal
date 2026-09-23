/**
 * Password strength estimate and generator for the vault editor. Runs in the
 * browser (Web Crypto), so it never sends the password anywhere.
 */
export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Good" | "Strong";
};

const LABELS: PasswordStrength["label"][] = ["Very weak", "Weak", "Fair", "Good", "Strong"];

const COMMON_WORDS = [
  "password", "passw0rd", "qwerty", "asdf", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon",
  "football", "baseball", "sunshine", "princess", "abc123", "123456", "infocus", "paly", "login", "secret"
];

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

function poolSize(password: string) {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 33;
  return Math.max(pool, 10);
}

/** Characters that add little guessing work: repeats, keyboard/alphabet runs, common words. */
function predictableChars(password: string) {
  const lower = password.toLowerCase();
  const flagged = new Array<boolean>(lower.length).fill(false);
  const flag = (start: number, length: number) => {
    for (let index = start; index < start + length; index += 1) flagged[index] = true;
  };

  for (const word of COMMON_WORDS) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + 1)) flag(at, word.length);
  }

  for (let index = 1; index < lower.length; index += 1) {
    if (lower[index] === lower[index - 1]) flag(index, 1);
    const pair = lower.slice(index - 1, index + 1);
    if (SEQUENCES.some((run) => run.includes(pair) || [...run].reverse().join("").includes(pair))) flag(index, 1);
  }

  return flagged.filter(Boolean).length;
}

export function scorePassword(password: string): PasswordStrength | null {
  if (!password) return null;
  const effectiveLength = Math.max(1, password.length - predictableChars(password));
  const bits = effectiveLength * Math.log2(poolSize(password));
  const score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as PasswordStrength["score"];
  return { score, label: LABELS[score] };
}

/* ------------------------------- Generator -------------------------------- */

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Unbiased random integer in [0, max) via rejection sampling. */
function randomIndex(max: number) {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

const pick = (chars: string) => chars[randomIndex(chars.length)];

/** Random password with every character class and no look-alike characters. */
export function generateStrongPassword(length = 20): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  const password = chars.join("");
  return scorePassword(password)?.score === 4 ? password : generateStrongPassword(length);
}
