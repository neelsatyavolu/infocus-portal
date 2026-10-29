import { normalizeSpokenWord, numberToWords } from "@/src/lib/teleprompter-normalize";
import { getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";
import type { ScriptWordMap } from "@/src/lib/teleprompter-script-words";

/*
 * Voice commands for Auto follow: "Teleprompter, go to the top", "Teleprompter, next",
 * "Teleprompter, go to the second announcement", "Teleprompter, go to spirit week". A command is
 * a sentence that starts with the wake word; everything else is script reading. The wake word
 * alone ("Teleprompter…" then a pause) waits for the command in the next utterance. Pure: takes
 * the heard words and the script, returns what to do.
 */

export type VoiceAction =
  | { kind: "goto"; word: number; label: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "undo" };

export type VoiceCommandResult =
  | { ok: true; action: VoiceAction; label: string }
  | { ok: false; heard: string }
  /**
   * Only the wake word, or the start of a command ("Teleprompter, go to…"): the rest should come
   * in the next utterance. Parse `pending` followed by that utterance's words.
   */
  | { ok: false; heard: string; waiting: true; pending: string[] };

export type VoiceCommandOptions = {
  /** The utterance began after a pause; if not (a cut out of long speech), its first word may be mid-sentence. */
  afterPause?: boolean;
  /** The wake word was just said on its own, so this utterance is the command even without it. */
  awake?: boolean;
};

export type VoiceContext = {
  map: ScriptWordMap;
  sections: Array<{ id: string; label: string; content: string }>;
  /** Last script word read (-1 before the first). */
  cursor: number;
};

const FILLERS = new Set([
  "hey", "ok", "okay", "hi", "yo", "um", "uh", "so", "oh", "ah", "and", "alright", "well",
  // What the models write for "hey" through static, and "you", a word they invent from noise.
  "they", "pay", "stay", "hay", "he", "a", "you"
]);
const MAX_FILLERS = 3;
const POLITE = new Set(["please", "can", "you", "could", "would", "now", "just"]);
/** What people tack on after the command ("…go to the top, please", "…next, thank you"). */
const TRAILING = new Set(["please", "now", "thanks", "thank", "you", "again", "ok", "okay", "real", "quick"]);
const GO_VERBS = [
  ["go", "to"],
  ["jump", "to"],
  ["skip", "to"],
  ["scroll", "to"],
  ["take", "me", "to"],
  ["back", "to"],
  ["go", "back", "to"],
  ["go", "up", "to"],
  ["move", "to"],
  ["goto"],
  ["go"]
];
const ARTICLES = new Set(["the", "a", "an", "our", "that", "this"]);
const ORDINALS: Record<string, number> = {
  first: 1, one: 1, second: 2, two: 2, third: 3, three: 3, fourth: 4, four: 4, fifth: 5, five: 5,
  sixth: 6, six: 6, seventh: 7, seven: 7, eighth: 8, eight: 8, ninth: 9, nine: 9, tenth: 10, ten: 10
};
const STORY_WORDS = new Set(["announcement", "announcements", "story", "stories", "item", "items", "bulletin"]);
const SECTION_WORDS = new Set(["section", "sections", "segment", "segments", "block", "part"]);
/** "top", "the beginning", "start over", "from the top", "all the way back up to the top of the script". */
const TOP_WORDS = new Set(["top", "tops", "beginning", "start", "restart", "reset", "rewind"]);
const TOP_FILLER = new Set([
  "the", "a", "all", "way", "up", "very", "back", "of", "it", "from", "over", "right", "to",
  "go", "take", "jump", "skip", "scroll", "move", "goto", "script", "page", "show", "rundown"
]);
/** Beat names as people say them → the beat heading in the script (badge "A2 - Bulletin"). */
const BEATS: Array<{ say: string[][]; beat: string }> = [
  { say: [["open"], ["opening"], ["intro"]], beat: "open" },
  { say: [["bulletin"], ["announcements"]], beat: "bulletin" },
  { say: [["package"], ["packages"]], beat: "package" },
  { say: [["thank", "yous"], ["thank", "you"], ["thanks"], ["thank", "you", "s"], ["thankyous"], ["thank", "use"]], beat: "thanks" },
  { say: [["closing"], ["close"], ["outro"], ["end"], ["sign", "off"], ["signoff"], ["goodbye"]], beat: "closing" }
];
const STOP_WORDS = new Set(["the", "a", "an", "of", "on", "in", "for", "to", "and", "about", "one", "with", "is", "at", "just"]);

function tokensOf(words: string[]) {
  return words.flatMap((word) => normalizeSpokenWord(word));
}

function startsWith(tokens: string[], phrase: string[]) {
  return phrase.every((word, index) => tokens[index] === word);
}

function same(tokens: string[], phrase: string[]) {
  return tokens.length === phrase.length && startsWith(tokens, phrase);
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

/** Consonants only, doubles collapsed: how a word sounds, whatever the spelling ("telly promter"). */
function consonants(word: string) {
  return word.replace(/[^a-z]/g, "").replace(/[aeiouy]/g, "").replace(/(.)\1+/g, "$1");
}

const TELEPROMPTER = consonants("teleprompter");
/** "prompter", and "promter" / "promper" as the models also write it. */
const PROMPTER = new Set([consonants("prompter"), consonants("promter"), consonants("promper")]);
/** Spellings whose consonants are just "prompt", which on its own isn't the wake word. */
const PROMPTER_SPELLINGS = new Set(["prompta", "prompto", "promptah"]);
/**
 * The wake word through static, as Moonshine and Whisper wrote it: "Telecom sure", "Telecompture",
 * "Telecom chair", "Telekomcha", "Teller chromter", "tell a computer". "tel…", a "p"/"m"/"k"-like
 * middle, and a "-ter" / "-ture" / "-cha" ending; "telephone", "telegram", "telescope",
 * "telepathy" and "tell a story" don't fit.
 */
const LOOSE_TELEPROMPTER = /^tel[a-z]*[mpbkcgf][a-z]*(?:t|ch|sh|s|z|k)(?:[aeiou]{0,2}r[ae]?|r?[aeiou]{1,2}r?)$/;
const LOOSE_MIN_LETTERS = 9;
/** Words that start a command, so a garbled wake word never swallows the command after it. */
const COMMAND_START = new Set([
  "go", "to", "the", "next", "back", "pause", "stop", "resume", "undo", "jump", "skip", "take", "up", "down", "line",
  "top", "please", "scroll", "move", "previous", "continue", "hold", "start", "restart", "announcement", "story"
]);

function looseWake(tokens: string[]) {
  const letters = tokens.join("");
  return (
    tokens.slice(1).every((token) => !COMMAND_START.has(token)) &&
    letters.length >= LOOSE_MIN_LETTERS &&
    LOOSE_TELEPROMPTER.test(letters)
  );
}

/**
 * How many words the wake word took: "teleprompter", or how the speech models split and spell
 * it ("tell a prompture", "telly promter", "tullipromter"), matched on its consonants, or by the
 * looser shape it takes through static ("telecom sure"); or a plain "prompter" ("prompture",
 * "promptor"), which must match exactly ("promptly" doesn't).
 */
function wakeLength(tokens: string[]) {
  for (let count = 1; count <= 3 && count <= tokens.length; count += 1) {
    const words = tokens.slice(0, count);
    const sound = consonants(words.join(""));
    // "tl…" (or "trl…", as in "terylopromter"; "dl…" through static), so "the teleprompter"
    // mid-sentence can't pass.
    if ((/^[td]r?l/.test(sound) && editDistance(sound, TELEPROMPTER) <= 2) || PROMPTER.has(sound) || looseWake(words)) {
      return count;
    }
    if (count === 1 && PROMPTER_SPELLINGS.has(words[0])) {
      return 1;
    }
  }
  return 0;
}

function skipFillers(tokens: string[], from: number) {
  let index = from;
  while (index - from < MAX_FILLERS && FILLERS.has(tokens[index] ?? "")) index += 1;
  return index;
}

/** Where the command words start, after "hey" and the wake word (said once or twice); -1 if it isn't a command. */
function afterWake(tokens: string[], awake: boolean) {
  const index = skipFillers(tokens, 0);
  const length = wakeLength(tokens.slice(index));
  if (length === 0) {
    return awake ? index : -1;
  }
  // "Teleprompter… hey teleprompter, go to the top."
  const again = skipFillers(tokens, index + length);
  const repeat = wakeLength(tokens.slice(again));
  return repeat > 0 ? again + repeat : index + length;
}

function stripLeading(tokens: string[], words: Set<string>) {
  let index = 0;
  while (index < tokens.length && words.has(tokens[index])) index += 1;
  return tokens.slice(index);
}

function stripTrailing(tokens: string[], words: Set<string>) {
  let end = tokens.length;
  while (end > 0 && words.has(tokens[end - 1])) end -= 1;
  return tokens.slice(0, end);
}

function isTop(tokens: string[]) {
  const rest = tokens.filter((token) => !TOP_FILLER.has(token));
  if (rest.length > 0 && rest.length <= 2 && rest.every((token) => TOP_WORDS.has(token))) {
    return true;
  }
  // A misheard verb: "build of the top", "built at the top".
  return tokens.length <= 5 && tokens.at(-2) === "the" && TOP_WORDS.has(tokens.at(-1) ?? "");
}

/** Same word, or (five letters or more) one letter off: "anouncement", "bulletins" for "bulletin". */
function closeTo(token: string, word: string) {
  return token === word || (word.length >= 5 && token.length >= 4 && editDistance(token, word) <= 1);
}

function sameAs(tokens: string[], phrase: string[]) {
  return tokens.length === phrase.length && phrase.every((word, index) => closeTo(tokens[index], word));
}

function blockStart(map: ScriptWordMap, word: number) {
  const block = map.blocks.find((entry) => entry.firstWordIndex <= word && word <= entry.lastWordIndex);
  return block ? map.blocks.indexOf(block) : -1;
}

function sectionBeat(section: { label: string; content: string }) {
  return getSectionDisplayParts(section).badgeLabel.split(" - ")[1]?.toLowerCase() ?? "";
}

function firstWordFrom(map: ScriptWordMap, sectionIndex: number) {
  return map.words.find((word) => word.sectionIndex >= sectionIndex)?.index ?? null;
}

/** The section of announcements: the first bulletin section with several stories, else the first bulletin. */
function bulletinSection(context: VoiceContext) {
  const bulletins = context.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => sectionBeat(section) === "bulletin");
  const counts = bulletins.map(({ section }) => context.map.blocks.filter((block) => block.sectionId === section.id).length);
  const many = bulletins.findIndex((_, index) => counts[index] > 1);
  return bulletins[many >= 0 ? many : 0];
}

function gotoWord(word: number | null | undefined, label: string): VoiceAction | null {
  return word === null || word === undefined ? null : { kind: "goto", word, label };
}

/** Numbers as the models sometimes write them: "announcement to", "a free" (A3). */
const NUMBER_SOUNDS: Record<string, string> = { to: "two", too: "two", for: "four", won: "one", tree: "three", free: "three", ate: "eight" };
const NUMBER_WORDS = new Set(["number", "no", "num"]);

/** "the second announcement", "announcement two", "announcement number 3", "the last story", "the first section". */
function ordinalTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  const words = tokens.filter((token) => !ARTICLES.has(token) && !NUMBER_WORDS.has(token));
  const nounAt = words.findIndex((token) => STORY_WORDS.has(token) || SECTION_WORDS.has(token));
  const noun = words[nounAt];
  const heardAfter = NUMBER_SOUNDS[words[nounAt + 1] ?? ""];
  const position = words.find((token) => token in ORDINALS || token === "last") ?? heardAfter;
  if (!noun || !position) {
    return null;
  }
  if (words.length > 3) {
    // A misheard verb before it ("goes at a second announcement"), but not "the top of the second announcement".
    const before = words.slice(0, -2);
    return words.length > 4 || before.some((token) => TOP_WORDS.has(token) || token === "of") ? null : ordinalTarget(words.slice(-2), context);
  }

  if (SECTION_WORDS.has(noun)) {
    const index = position === "last" ? context.sections.length - 1 : ORDINALS[position] - 1;
    const section = context.sections[index];
    return section ? gotoWord(firstWordFrom(context.map, index), section.label) : null;
  }

  const bulletin = bulletinSection(context);
  const stories = context.map.blocks.filter((block) => !bulletin || block.sectionId === bulletin.section.id);
  const story = position === "last" ? stories[stories.length - 1] : stories[ORDINALS[position] - 1];
  if (!story) return null;
  const number = position === "last" ? stories.length : ORDINALS[position];
  return gotoWord(story.firstWordIndex, `Announcement ${number}`);
}

/** Letters as the models write them when said alone. */
const LETTER_SOUNDS: Record<string, string> = { ay: "a", eh: "a", be: "b", bee: "b", see: "c", sea: "c", dee: "d" };

function labelSaid(tokens: string[]) {
  return tokens.map((token, index) => (index === 0 ? LETTER_SOUNDS[token] : NUMBER_SOUNDS[token]) ?? token).join("");
}

/** "A3", "a three", "a 3", "a free"; also at the end of a misheard verb ("door to a3"). */
function labelTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  // "a" stays: it's the letter in "A three".
  const words = tokens.filter((token) => token !== "the" && !SECTION_WORDS.has(token));
  if (words.length === 0) return null;
  const tries = [words, words.slice(-2), words.slice(-1)].map(labelSaid);
  const index = context.sections.findIndex((section) => {
    const match = section.label.toLowerCase().match(/^([a-z]+)(\d+)$/);
    const forms = [section.label.toLowerCase().replace(/\s+/g, "")];
    if (match) forms.push(`${match[1]}${numberToWords(Number(match[2])).replace(/\s+/g, "")}`);
    return tries.some((said) => forms.includes(said));
  });
  return index >= 0 ? gotoWord(firstWordFrom(context.map, index), context.sections[index].label) : null;
}

function beatTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  const said = tokens.filter((token) => !ARTICLES.has(token));
  const beat = BEATS.find((entry) => entry.say.some((phrase) => sameAs(said, phrase)));
  if (!beat) return null;
  if (beat.beat === "bulletin") {
    const bulletin = bulletinSection(context);
    return bulletin ? gotoWord(firstWordFrom(context.map, bulletin.index), bulletin.section.label) : null;
  }
  if (beat.beat === "thanks") {
    // The thank-yous are a bulletin section too, after the announcements.
    const bulletin = bulletinSection(context);
    const index = context.sections.findIndex((section, position) => sectionBeat(section) === "bulletin" && position !== bulletin?.index);
    return index >= 0 ? gotoWord(firstWordFrom(context.map, index), context.sections[index].label) : null;
  }
  const index = context.sections.findIndex((section) => sectionBeat(section) === beat.beat);
  return index >= 0 ? gotoWord(firstWordFrom(context.map, index), context.sections[index].label) : null;
}

/** A story by what it's about: "spirit week", "robotics". Needs a clear winner. */
function titleTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  const wanted = tokens.filter((token) => !STOP_WORDS.has(token) && !STORY_WORDS.has(token));
  if (wanted.length === 0 || wanted.length > 5) return null;
  const scored = context.map.blocks.map((block) => {
    const have = new Set(
      context.map.words.slice(block.firstWordIndex, Math.min(block.lastWordIndex, block.firstWordIndex + 14) + 1).flatMap((word) => word.tokens)
    );
    const hits = wanted.filter((token) => have.has(token) || [...have].some((word) => word.length >= 5 && editDistance(word, token) <= 1)).length;
    return { block, score: hits / wanted.length };
  });
  const ranked = [...scored].sort((left, right) => right.score - left.score);
  const [best, second] = ranked;
  // Most of the words, clearly ahead of the rest; or (a misheard word, "spirit league") the only
  // story with any of them.
  const clear = best && (best.score >= 0.75 ? !second || second.score <= best.score - 0.25 : best.score >= 0.5 && (second?.score ?? 0) === 0);
  if (!clear) return null;
  const firstWords = context.map.words.slice(best.block.firstWordIndex, best.block.firstWordIndex + 3).map((word) => word.raw).join(" ");
  return gotoWord(best.block.firstWordIndex, `“${firstWords}…”`);
}

/** "next", and what the models wrote for it through static. */
const NEXT_WORDS = new Set(["next", "nex", "negst", "necks", "neck", "nest", "nests", "nix", "max"]);
const NEXT_PHRASES = new Set(["skip", "skip it", "skip this", "skip ahead", "move on", "moving on", "next please"]);
const BACK_PHRASES = new Set(["back", "bag", "pack", "previous", "go back", "go pack", "gillback", "go bag"]);

function moveTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  const said = tokens.filter((token) => !ARTICLES.has(token) && token !== "one");
  const { map, cursor } = context;
  const current = blockStart(map, Math.max(0, cursor + 1));
  const phrase = said.join(" ");
  const isNext =
    NEXT_PHRASES.has(phrase) ||
    (NEXT_WORDS.has(said[0] ?? "") && (said.length === 1 || (said.length === 2 && STORY_WORDS.has(said[1]))));
  const isBack = BACK_PHRASES.has(phrase) || (said[0] === "previous" && said.length === 2 && STORY_WORDS.has(said[1]));
  if (isNext) {
    const block = map.blocks[current + 1];
    return block ? gotoWord(block.firstWordIndex, "Next") : null;
  }
  if (isBack) {
    const here = map.blocks[current];
    // Like a media player: back to the start of this story, or the one before if already there.
    const target = here && cursor + 1 - here.firstWordIndex > 2 ? here : map.blocks[current - 1] ?? here;
    return target ? gotoWord(target.firstWordIndex, "Back") : null;
  }
  const lineBack = [["line", "back"], ["lineback"], ["line", "bag"], ["back", "line"], ["up", "line"], ["back", "a", "line"]];
  if (lineBack.some((phrase) => same(said, phrase))) {
    return gotoWord(lineStartFrom(context, -1), "Line back");
  }
  return nudgeTarget(tokens, context);
}

/** First word of the line `lines` away from the one being read (negative is up, toward the top). */
function lineStartFrom({ map, cursor }: VoiceContext, lines: number) {
  const starts = map.words.filter((word, index) => {
    const before = map.words[index - 1];
    return !before || before.sectionIndex !== word.sectionIndex || before.lineIndex !== word.lineIndex;
  });
  const word = map.words[Math.max(0, cursor)];
  const here = starts.findLastIndex((start) => !word || start.index <= word.index);
  return starts[Math.min(starts.length - 1, Math.max(0, here + lines))]?.index ?? 0;
}

const UP_WORDS = new Set(["up", "back", "backward", "backwards", "higher", "earlier", "previous"]);
const DOWN_WORDS = new Set(["down", "forward", "forwards", "ahead", "lower", "further", "next"]);
const NUDGE_WORDS = new Set(["go", "move", "scroll", "jump", "just", "a", "the", "by", "one", "line", "lines", "little", "bit", "tad", "touch", "few", "more"]);
const LINE_COUNTS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const LITTLE_LINES = 2;
const FEW_LINES = 3;

/** "Go up a little bit", "down a line", "back two lines", "a bit lower". */
function nudgeTarget(said: string[], context: VoiceContext): VoiceAction | null {
  const isKnown = (token: string) => UP_WORDS.has(token) || DOWN_WORDS.has(token) || NUDGE_WORDS.has(token) || token in LINE_COUNTS;
  // One misheard verb before it is fine: "show up a little bit".
  const tokens = !isKnown(said[0] ?? "") && said.length > 1 ? said.slice(1) : said;
  const up = tokens.some((token) => UP_WORDS.has(token));
  const down = tokens.some((token) => DOWN_WORDS.has(token));
  const counts = tokens.filter((token) => token in LINE_COUNTS);
  if (up === down || !tokens.every(isKnown) || counts.length > 1) {
    return null;
  }
  const lines = counts.length > 0 ? LINE_COUNTS[counts[0]] : tokens.includes("few") ? FEW_LINES : tokens.includes("line") ? 1 : LITTLE_LINES;
  const label = `${up ? "Up" : "Down"} ${lines === 1 ? "a line" : `${lines} lines`}`;
  return gotoWord(lineStartFrom(context, up ? -lines : lines), label);
}

// Includes what the speech models were heard writing for these words, some through static
// ("cause" and "pod" for pause, "review" and "re-zoom" for resume, "and do" for undo).
const PAUSE_WORDS = [
  "pause", "paws", "pose", "cause", "caused", "calls", "pod", "hot", "paused", "pauses", "stop", "hold", "freeze", "wait", "hold on", "hold it",
  "hold up", "hang on", "wait a second", "wait a sec", "one second", "one sec", "stop scrolling", "stop following"
];
const RESUME_WORDS = [
  "resume", "continue", "keep going", "go on", "start", "follow", "start following", "unpause", "play", "review", "rezoom",
  "re zoom", "resumed", "resumee", "presume", "go ahead", "carry on", "keep scrolling", "start scrolling", "start again", "unfreeze",
  "lets go"
];
const UNDO_WORDS = [
  "undo", "and do", "andu", "undue", "on do", "undie", "andndo", "cancel", "never mind", "nevermind", "undo that", "oops", "whoops",
  "wrong one", "not that", "not that one"
];
/** "Pause it", "stop that". */
const CONTROL_TRAILING = new Set(["it", "that"]);

function controlAction(tokens: string[]): VoiceAction | null {
  const trimmed = stripTrailing(tokens, CONTROL_TRAILING);
  for (const said of new Set([tokens.join(" "), trimmed.join(" ")])) {
    if (PAUSE_WORDS.includes(said)) return { kind: "pause" };
    if (RESUME_WORDS.includes(said)) return { kind: "resume" };
    if (UNDO_WORDS.includes(said)) return { kind: "undo" };
  }
  // One word a letter off: "pausse", "resum", "contineu".
  if (trimmed.length === 1) {
    const [word] = trimmed;
    if (["pause", "freeze"].some((target) => closeTo(word, target))) return { kind: "pause" };
    if (["resume", "continue", "unpause"].some((target) => closeTo(word, target))) return { kind: "resume" };
  }
  return null;
}

const ACTION_LABELS: Record<Exclude<VoiceAction["kind"], "goto">, string> = { pause: "Pause", resume: "Resume", undo: "Undo" };

/**
 * Reads one finished utterance. null: not a command (no wake word starting a sentence, or the
 * script here mentions a wake word, so it's being read). Otherwise what to do, what it didn't
 * understand, or that it heard only the wake word and is waiting for the rest.
 */
export function parseVoiceCommand(words: string[], context: VoiceContext, options: VoiceCommandOptions = {}): VoiceCommandResult | null {
  const { afterPause = true, awake = false } = options;
  // The wake word may also start a new sentence inside the utterance: the crew often speaks right
  // after the anchor ("…Vikings. Teleprompter, go to the top."). A cut out of long speech may
  // start mid-sentence, so its first word only counts after a pause.
  const sentenceStarts = words.flatMap((word, index) => (index > 0 && /[.!?]["”']?$/.test(words[index - 1]) ? [index] : []));
  const starts = afterPause || awake ? [0, ...sentenceStarts] : sentenceStarts;
  let fallback: VoiceCommandResult | null = null;
  for (const start of starts) {
    const result = parseSentence(words.slice(start), context, awake && start === 0);
    if (result?.ok) return result;
    fallback ??= result;
  }
  // Through static the models often leave out the full stop ("…Vikings teleprompter go to the
  // top"), so a wake word mid-sentence counts too, but only for a command it understood, and
  // not after "the" / "a" / "to" and the like ("the teleprompter is slow, go to the top").
  for (let index = 1; index < words.length; index += 1) {
    const before = tokensOf([words[index - 1]]).at(-1) ?? "";
    // Straight onto the wake word: "a teleprompter" mustn't pass as a "hey" before it.
    const first = tokensOf([words[index]])[0] ?? "";
    if (starts.includes(index) || MENTION_BEFORE.has(before) || FILLERS.has(first)) continue;
    const result = parseSentence(words.slice(index), context, false);
    if (result && (result.ok || "waiting" in result)) return result;
  }
  return fallback;
}

/** Words before "teleprompter" that make it a mention, not a call. */
const MENTION_BEFORE = new Set([
  "the", "a", "an", "our", "this", "that", "new", "my", "your", "their", "his", "her", "its", "to", "of", "for", "with", "on",
  "at", "by", "from", "about", "in", "into", "no", "any", "some", "like", "is"
]);
/** All that came after the wake word was the start of a command: "Teleprompter, go to…". */
const COMMAND_OPENERS = new Set(["go", "to", "the", "jump", "skip", "scroll", "take", "me", "move", "goto", "um", "uh"]);

/** Words the script says here, so the anchor reading "…tell a computer go to the top" isn't a command. */
const SCRIPT_ECHO_TOKENS = 4;

function readFromScript(tokens: string[], nearby: VoiceContext["map"]["words"]) {
  const heard = stripLeading(tokens, FILLERS).slice(0, SCRIPT_ECHO_TOKENS);
  const script = ` ${nearby.flatMap((word) => word.tokens).join(" ")} `;
  return heard.length >= 3 && script.includes(` ${heard.join(" ")} `);
}

function parseSentence(words: string[], context: VoiceContext, awake: boolean): VoiceCommandResult | null {
  const tokens = tokensOf(words);
  const start = afterWake(tokens, awake);
  if (start < 0) {
    return null;
  }
  const nearby = context.map.words.slice(Math.max(0, context.cursor - 5), Math.max(0, context.cursor + 40));
  if (nearby.some((word) => word.mentionsWakeWord) || readFromScript(tokens, nearby)) {
    return null;
  }

  const heard = words.join(" ");
  const rest = stripLeading(tokens.slice(start), POLITE);
  const trimmed = stripTrailing(rest, TRAILING);
  if (trimmed.length === 0) {
    return awake ? { ok: false, heard } : { ok: false, heard, waiting: true, pending: words };
  }
  // As said first ("go to the thank yous" ends in "you"), then without the trailing pleasantries.
  for (const command of trimmed.length < rest.length ? [rest, trimmed] : [rest]) {
    const found = commandAction(command, context);
    if (found) return { ok: true, action: found.action, label: found.label };
  }
  // A pause (or a crackle) cut the command off: the rest comes in the next utterance.
  if (trimmed.every((token) => COMMAND_OPENERS.has(token))) {
    return { ok: false, heard, waiting: true, pending: words };
  }
  return { ok: false, heard };
}

function commandAction(rest: string[], context: VoiceContext): { action: VoiceAction; label: string } | null {
  if (rest.length > 12) {
    return null;
  }
  const control = controlAction(rest);
  if (control?.kind === "pause" || control?.kind === "resume" || control?.kind === "undo") {
    return { action: control, label: ACTION_LABELS[control.kind] };
  }
  const move = moveTarget(rest, context);
  if (move?.kind === "goto") {
    return { action: move, label: move.label };
  }
  const verb = GO_VERBS.find((phrase) => startsWith(rest, phrase) && rest.length > phrase.length);
  const target = verb ? rest.slice(verb.length) : rest;
  if (isTop(target)) {
    return { action: { kind: "goto", word: 0, label: "Top" }, label: "Top" };
  }
  const found =
    ordinalTarget(target, context) ??
    labelTarget(target, context) ??
    beatTarget(target, context) ??
    titleTarget(target, context) ??
    // A misheard verb in front: "notice spirit week", "coach of spirit week".
    (target.length >= 3 ? titleTarget(target.slice(1), context) : null);
  return found?.kind === "goto" ? { action: found, label: found.label } : null;
}
