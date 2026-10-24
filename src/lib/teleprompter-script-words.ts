import { normalizeSpokenWord } from "@/src/lib/teleprompter-normalize";
import { classifyRunScriptLine, getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";

/*
 * The words an anchor reads, in order, built from the same line classification run mode
 * renders, so the follow-along cursor and the screen can't disagree. Cameras, cues, beat
 * headings and inline {…} / […] placeholders are shown but never read, so they get no word
 * index. Pure; run mode renders each spoken line from `lineParts`.
 */

export type StyledSegment = {
  text: string;
  tone: "default" | "red" | "yellow";
};

export type ScriptWord = {
  index: number;
  /** The word as written (style tags removed). */
  raw: string;
  /** Normalized tokens for matching (teleprompter-normalize). Never empty. */
  tokens: string[];
  sectionId: string;
  sectionIndex: number;
  /** Index into the section's displayed lines (after the beat heading is removed). */
  lineIndex: number;
  blockId: string;
  /** The line says "teleprompter" or "prompter" (the voice wake word): reading it is never a command. */
  mentionsWakeWord: boolean;
};

/** A run of script from one `CAM n` line to the next (one story or announcement). */
export type ScriptBlock = {
  id: string;
  sectionId: string;
  startLineIndex: number;
  firstWordIndex: number;
  lastWordIndex: number;
  /** A `{ROLL …}` (or SOT/PKG/PLAY) cue follows the block's words: the anchor tosses to tape. */
  rollAfter: boolean;
};

/** One rendered piece of a spoken line: a word, or the space/punctuation/placeholder between. */
export type ScriptLinePart = StyledSegment & { wordIndex: number | null };

export type ScriptWordMap = {
  words: ScriptWord[];
  blocks: ScriptBlock[];
  /** Spoken lines only, keyed by scriptLineKey(sectionId, lineIndex). */
  lineParts: Map<string, ScriptLinePart[]>;
};

export type ReadingLine = { sectionIndex: number; lineIndex: number };

const STYLE_PATTERN = /(\[(?:RED|YELLOW)\].*?\[\/(?:RED|YELLOW)\])/gi;
const INLINE_PLACEHOLDER = /(\{[^}]*\}|\[[^\]]*\])/;
const WHOLE_PLACEHOLDER = /^(\{[^}]*\}|\[[^\]]*\])$/;
/** The voice-command wake words (teleprompter-voice-commands.ts). */
const WAKE_WORDS = new Set(["teleprompter", "prompter"]);
/** Cues that hand off to tape: a package, an intro or outro, a sound bite. */
const ROLL_CUE = /^(ROLL|PKG|SOT|PLAY)\b/;

export function splitStyledSegments(text: string): StyledSegment[] {
  if (!text) {
    return [];
  }

  return text
    .split(STYLE_PATTERN)
    .filter(Boolean)
    .map((chunk) => {
      const upper = chunk.toUpperCase();
      if (upper.startsWith("[RED]") && upper.endsWith("[/RED]")) {
        return { text: chunk.slice(5, -6), tone: "red" };
      }
      if (upper.startsWith("[YELLOW]") && upper.endsWith("[/YELLOW]")) {
        return { text: chunk.slice(8, -9), tone: "yellow" };
      }
      return { text: chunk, tone: "default" };
    });
}

export function scriptLineKey(sectionId: string, lineIndex: number) {
  return `${sectionId}:${lineIndex}`;
}

/** The text run mode shows as spoken copy for a line, or null for gaps, cameras and bare cues. */
function spokenTextOf(classified: ReturnType<typeof classifyRunScriptLine>) {
  if (classified.kind === "spoken") {
    return classified.text;
  }
  if (classified.kind === "cue") {
    return classified.spoken ?? null;
  }
  return null;
}

type PendingWord = { raw: string; tokens: string[] };

/** Splits a spoken line into parts; words with tokens get a slot in `pending`. */
function lineParts(text: string, pending: PendingWord[]) {
  const parts: Array<StyledSegment & { pendingIndex: number | null }> = [];
  for (const segment of splitStyledSegments(text)) {
    for (const chunk of segment.text.split(INLINE_PLACEHOLDER).filter(Boolean)) {
      if (WHOLE_PLACEHOLDER.test(chunk)) {
        parts.push({ text: chunk, tone: segment.tone, pendingIndex: null });
        continue;
      }
      for (const piece of chunk.split(/(\s+)/).filter(Boolean)) {
        const tokens = /^\s+$/.test(piece) ? [] : normalizeSpokenWord(piece);
        if (tokens.length === 0) {
          parts.push({ text: piece, tone: segment.tone, pendingIndex: null });
          continue;
        }
        pending.push({ raw: piece, tokens });
        parts.push({ text: piece, tone: segment.tone, pendingIndex: pending.length - 1 });
      }
    }
  }
  return parts;
}

export function buildScriptWordMap(sections: Array<{ id: string; label: string; content: string }>): ScriptWordMap {
  const words: ScriptWord[] = [];
  const blocks: ScriptBlock[] = [];
  const partsByLine = new Map<string, ScriptLinePart[]>();
  // The last block with words, across camera lines and sections: a roll cue after a `CAM n`
  // line or at the top of the next section still ends that story.
  let lastBlock: ScriptBlock | null = null;

  sections.forEach((section, sectionIndex) => {
    const lines = getSectionDisplayParts(section).content.split(/\r?\n/);
    let blockNumber = 0;
    let blockStartLine = 0;
    let block: ScriptBlock | null = null;

    lines.forEach((line, lineIndex) => {
      const classified = classifyRunScriptLine(line);
      if (classified.kind === "camera") {
        blockNumber += 1;
        blockStartLine = lineIndex;
        block = null;
        return;
      }

      if (lastBlock && classified.kind === "cue" && !classified.spoken && ROLL_CUE.test(classified.text)) {
        lastBlock.rollAfter = true;
        // Copy after the roll (coming back from the package) is a new story.
        if (block) {
          blockNumber += 1;
          blockStartLine = lineIndex;
          block = null;
        }
      }

      const text = spokenTextOf(classified);
      if (text === null) {
        return;
      }

      const pending: PendingWord[] = [];
      const parts = lineParts(text, pending);
      const firstIndex = words.length;
      const mentionsWakeWord = pending.some((word) => word.tokens.some((token) => WAKE_WORDS.has(token)));

      if (pending.length > 0 && !block) {
        block = {
          id: `${section.id}#${blockNumber}`,
          sectionId: section.id,
          startLineIndex: blockStartLine,
          firstWordIndex: firstIndex,
          lastWordIndex: firstIndex,
          rollAfter: false
        };
        blocks.push(block);
        lastBlock = block;
      }

      pending.forEach((word, offset) => {
        words.push({
          index: firstIndex + offset,
          raw: word.raw,
          tokens: word.tokens,
          sectionId: section.id,
          sectionIndex,
          lineIndex,
          blockId: block?.id ?? "",
          mentionsWakeWord
        });
      });
      if (block && pending.length > 0) {
        block.lastWordIndex = words.length - 1;
      }

      partsByLine.set(
        scriptLineKey(section.id, lineIndex),
        parts.map(({ pendingIndex, ...part }) => ({
          ...part,
          wordIndex: pendingIndex === null ? null : firstIndex + pendingIndex
        }))
      );
    });
  });

  return { words, blocks, lineParts: partsByLine };
}

/** The section and line holding word `cursor`, or null when there's no such word. */
export function readingLineOf(map: ScriptWordMap, cursor: number | null): ReadingLine | null {
  const word = cursor === null ? undefined : map.words[cursor];
  return word ? { sectionIndex: word.sectionIndex, lineIndex: word.lineIndex } : null;
}

/** How many of a section's lines, from the top, have been read (dimmed in run mode). */
export function readLinesBefore(sectionIndex: number, reading: ReadingLine | null) {
  if (!reading || sectionIndex > reading.sectionIndex) {
    return 0;
  }
  return sectionIndex < reading.sectionIndex ? Infinity : reading.lineIndex;
}
