import { normalizeSpokenWord, numberToWords } from "@/src/lib/teleprompter-normalize";
import { getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";
import type { ScriptWordMap } from "@/src/lib/teleprompter-script-words";

/*
 * Voice commands for Auto follow: "Teleprompter, go to the top", "Teleprompter, next",
 * "Teleprompter, go to the second announcement", "Teleprompter, go to spirit week". A command is
 * an utterance that starts with the wake word, said after a pause; everything else is script
 * reading. Pure: takes the heard words and the script, returns what to do.
 */

export type VoiceAction =
  | { kind: "goto"; word: number; label: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "undo" };

export type VoiceCommandResult = { ok: true; action: VoiceAction; label: string } | { ok: false; heard: string };

export type VoiceContext = {
  map: ScriptWordMap;
  sections: Array<{ id: string; label: string; content: string }>;
  /** Last script word read (-1 before the first). */
  cursor: number;
};

const FILLERS = new Set(["hey", "ok", "okay", "hi", "yo", "um", "uh", "so"]);
const POLITE = new Set(["please", "can", "you", "could", "would", "now", "just"]);
const GO_VERBS = [
  ["go", "to"],
  ["jump", "to"],
  ["skip", "to"],
  ["scroll", "to"],
  ["take", "me", "to"],
  ["back", "to"],
  ["go", "back", "to"],
  ["go"]
];
const ARTICLES = new Set(["the", "a", "an", "our", "that", "this"]);
const ORDINALS: Record<string, number> = {
  first: 1, one: 1, second: 2, two: 2, third: 3, three: 3, fourth: 4, four: 4, fifth: 5, five: 5,
  sixth: 6, six: 6, seventh: 7, seven: 7, eighth: 8, eight: 8, ninth: 9, nine: 9, tenth: 10, ten: 10
};
const STORY_WORDS = new Set(["announcement", "announcements", "story", "stories", "item", "items", "bulletin"]);
const SECTION_WORDS = new Set(["section", "sections", "segment", "segments", "block", "part"]);
const TOP_PHRASES = [["top"], ["top", "of", "show"], ["top", "of", "the", "show"], ["beginning"], ["start"], ["very", "top"]];
/** Beat names as people say them → the beat heading in the script (badge "A2 - Bulletin"). */
const BEATS: Array<{ say: string[][]; beat: string }> = [
  { say: [["open"], ["opening"], ["intro"]], beat: "open" },
  { say: [["bulletin"], ["announcements"], ["the", "announcements"]], beat: "bulletin" },
  { say: [["package"], ["packages"]], beat: "package" },
  { say: [["thank", "yous"], ["thank", "you"], ["thanks"], ["thank", "you", "s"]], beat: "thanks" },
  { say: [["closing"], ["close"], ["outro"], ["end"], ["sign", "off"]], beat: "closing" }
];
const STOP_WORDS = new Set(["the", "a", "an", "of", "on", "in", "for", "to", "and", "about", "one", "with", "is", "at"]);

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
const PROMPTER = consonants("prompter");

/**
 * How many words the wake word took: "teleprompter", or how the speech models split and spell
 * it ("tell a prompture", "telly promter", "tullipromter"), matched on its consonants; or a
 * plain "prompter" ("prompture", "promptor"), which must match exactly ("promptly" doesn't).
 */
function wakeLength(tokens: string[]) {
  for (let count = 1; count <= 3 && count <= tokens.length; count += 1) {
    const sound = consonants(tokens.slice(0, count).join(""));
    // "tl…" (or "trl…", as in "terylopromter"), so "the teleprompter" mid-sentence can't pass.
    if ((/^tr?l/.test(sound) && editDistance(sound, TELEPROMPTER) <= 2) || sound === PROMPTER) {
      return count;
    }
  }
  return 0;
}

/** Where the command words start, after "hey" and the wake word; -1 if it isn't a command. */
function afterWake(tokens: string[]) {
  let index = 0;
  while (index < 2 && FILLERS.has(tokens[index] ?? "")) index += 1;
  const length = wakeLength(tokens.slice(index));
  return length === 0 ? -1 : index + length;
}

function stripLeading(tokens: string[], words: Set<string>) {
  let index = 0;
  while (index < tokens.length && words.has(tokens[index])) index += 1;
  return tokens.slice(index);
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

/** "the second announcement", "announcement two", "the last story", "the first section". */
function ordinalTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  const words = tokens.filter((token) => !ARTICLES.has(token));
  const noun = words.find((token) => STORY_WORDS.has(token) || SECTION_WORDS.has(token));
  const position = words.find((token) => token in ORDINALS || token === "last");
  if (!noun || !position || words.length > 3) {
    return null;
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

/** "A3", "a three", "a 3". */
function labelTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  // "a" stays: it's the letter in "A three".
  const said = tokens.filter((token) => token !== "the" && !SECTION_WORDS.has(token)).join("");
  if (!said) return null;
  const index = context.sections.findIndex((section) => {
    const match = section.label.toLowerCase().match(/^([a-z]+)(\d+)$/);
    const forms = [section.label.toLowerCase().replace(/\s+/g, "")];
    if (match) forms.push(`${match[1]}${numberToWords(Number(match[2])).replace(/\s+/g, "")}`);
    return forms.includes(said);
  });
  return index >= 0 ? gotoWord(firstWordFrom(context.map, index), context.sections[index].label) : null;
}

function beatTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  const said = tokens.filter((token) => !ARTICLES.has(token));
  const beat = BEATS.find((entry) => entry.say.some((phrase) => same(said, phrase)));
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

function moveTarget(tokens: string[], context: VoiceContext): VoiceAction | null {
  const said = tokens.filter((token) => !ARTICLES.has(token) && token !== "one");
  const { map, cursor } = context;
  const current = blockStart(map, Math.max(0, cursor + 1));
  const isNext =
    ["next", "nex", "negst"].some((word) => same(said, [word])) || (said[0] === "next" && said.length === 2 && STORY_WORDS.has(said[1]));
  const isBack =
    same(said, ["back"]) ||
    same(said, ["previous"]) ||
    same(said, ["go", "back"]) ||
    (said[0] === "previous" && said.length === 2 && STORY_WORDS.has(said[1]));
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
    const word = map.words[Math.max(0, cursor)];
    const previousLine = word ? [...map.words].reverse().find((entry) => entry.index < word.index && (entry.sectionIndex !== word.sectionIndex || entry.lineIndex !== word.lineIndex)) : undefined;
    const lineStart = previousLine ? map.words.find((entry) => entry.sectionIndex === previousLine.sectionIndex && entry.lineIndex === previousLine.lineIndex) : undefined;
    return gotoWord(lineStart?.index ?? 0, "Line back");
  }
  return null;
}

// Includes what the speech models were heard writing for these words ("cause" for pause).
const PAUSE_WORDS = ["pause", "paws", "pose", "cause", "stop", "hold", "freeze", "wait", "hold on", "hold it"];
const RESUME_WORDS = ["resume", "continue", "keep going", "go on", "start", "follow", "start following", "unpause", "play"];
const UNDO_WORDS = ["undo", "and do", "andu", "undue", "on do", "cancel", "never mind", "nevermind", "undo that"];

function controlAction(tokens: string[]): VoiceAction | null {
  const said = tokens.join(" ");
  if (PAUSE_WORDS.includes(said)) return { kind: "pause" };
  if (RESUME_WORDS.includes(said)) return { kind: "resume" };
  if (UNDO_WORDS.includes(said)) return { kind: "undo" };
  return null;
}

const ACTION_LABELS: Record<Exclude<VoiceAction["kind"], "goto">, string> = { pause: "Pause", resume: "Resume", undo: "Undo" };

/**
 * Reads one finished utterance. null: not a command (no wake word at the start, or the script
 * here mentions a wake word, so it's being read). Otherwise what to do, or what it didn't understand.
 */
export function parseVoiceCommand(words: string[], context: VoiceContext): VoiceCommandResult | null {
  // The wake word may also start a new sentence inside the utterance: the crew often speaks right
  // after the anchor ("…Vikings. Teleprompter, go to the top."). Never mid-sentence.
  const sentenceStarts = words.flatMap((word, index) => (index > 0 && /[.!?]["”']?$/.test(words[index - 1]) ? [index] : []));
  for (const start of [0, ...sentenceStarts]) {
    const result = parseSentence(words.slice(start), context);
    if (result) return result;
  }
  return null;
}

function parseSentence(words: string[], context: VoiceContext): VoiceCommandResult | null {
  const tokens = tokensOf(words);
  const start = afterWake(tokens);
  if (start < 0) {
    return null;
  }
  const nearby = context.map.words.slice(Math.max(0, context.cursor - 5), Math.max(0, context.cursor + 40));
  if (nearby.some((word) => word.mentionsWakeWord)) {
    return null;
  }

  const heard = words.join(" ");
  const rest = stripLeading(tokens.slice(start), POLITE);
  if (rest.length === 0 || rest.length > 10) {
    return { ok: false, heard };
  }

  const control = controlAction(rest);
  if (control?.kind === "pause" || control?.kind === "resume" || control?.kind === "undo") {
    return { ok: true, action: control, label: ACTION_LABELS[control.kind] };
  }
  const move = moveTarget(rest, context);
  if (move?.kind === "goto") {
    return { ok: true, action: move, label: move.label };
  }

  const verb = GO_VERBS.find((phrase) => startsWith(rest, phrase) && rest.length > phrase.length);
  const target = verb ? rest.slice(verb.length) : rest;
  if (TOP_PHRASES.some((phrase) => same(target.filter((token) => !ARTICLES.has(token)), phrase))) {
    return { ok: true, action: { kind: "goto", word: 0, label: "Top" }, label: "Top" };
  }
  const found =
    ordinalTarget(target, context) ?? labelTarget(target, context) ?? beatTarget(target, context) ?? titleTarget(target, context);
  return found?.kind === "goto" ? { ok: true, action: found, label: found.label } : { ok: false, heard };
}
