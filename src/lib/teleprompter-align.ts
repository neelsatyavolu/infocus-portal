import { normalizeSpokenWord } from "@/src/lib/teleprompter-normalize";
import type { ScriptWordMap } from "@/src/lib/teleprompter-script-words";

/*
 * Follow-along: turns words heard from the anchor into a script position. The cursor is the last
 * script word we're sure was read; it moves only on solid matches (a few words in a row, rare
 * words counting more than "the"), so banter, packages and misheard words leave it where it is.
 * Pure and clock-free (callers pass `now`), so it runs the same in tests and in run mode.
 */

/**
 * follow: matches are arriving. hold: nothing matched for a moment, the screen stays put.
 * package: the anchor tossed to a `{ROLL …}`; only the start of the next story can move it.
 * search: lost for a while; look across the whole script, with stricter proof.
 */
export type FollowMode = "follow" | "hold" | "package" | "search";

export const FOLLOW_HOLD_AFTER_MS = 2500;
export const FOLLOW_SEARCH_AFTER_MS = 6000;
/** A package that runs this long with no match may have been cut: start looking further ahead. */
export const PACKAGE_SEARCH_AFTER_MS = 15_000;
/** Recognized text arrives about this late; the screen leads by the words read in that time. */
const LATENCY_MS = 800;
const MAX_LEAD_WORDS = 4;
/** Unconfirmed (still changing) words may pull the screen at most this far past the cursor. */
const MAX_GHOST_WORDS = 6;
const SPEED_WINDOW_MS = 10_000;
const TAIL_TOKENS = 10;
/** Far enough back to find a re-read line; going back still needs six words in a row. */
const LOOK_BEHIND_TOKENS = 24;
const LOOK_AHEAD_TOKENS = 60;
/** The match must end in the last few heard words, or it's old news. */
const FRESH_TOKENS = 3;
const PACKAGE_NEXT_WORDS = 30;

const FUZZY = 0.6;
const MISMATCH = -0.5;
const GAP = -0.4;

type Rules = { lo: number; hi: number; minMatches: number; minScore: number; minRatio: number };

export type TailMatch = {
  /** Script token index the match ends on. */
  end: number;
  matches: number;
  score: number;
  /** Matched words ÷ heard words spanned by the match. */
  ratio: number;
};

/** Common words count less: "the" appears everywhere, a name or "robotics" pins the spot. */
function tokenWeight(count: number) {
  if (count <= 1) return 1;
  if (count <= 3) return 0.8;
  if (count <= 8) return 0.6;
  return 0.4;
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length];
}

/** 1 for the same word, FUZZY for a near miss ("maialearning" / "maya learning" pieces), else 0. */
function similarity(heard: string, script: string) {
  if (heard === script) {
    return 1;
  }
  const longest = Math.max(heard.length, script.length);
  if (Math.min(heard.length, script.length) < 4) {
    return 0;
  }
  return 1 - editDistance(heard, script) / longest >= 0.75 ? FUZZY : 0;
}

type Cell = { score: number; matches: number; start: number };
const EMPTY: Cell = { score: 0, matches: 0, start: 0 };

/**
 * Local alignment (Smith-Waterman) of the heard tail against script tokens [lo, hi). Returns the
 * best-scoring match that ends in the freshest heard words; ties go to the spot nearest `lo`.
 */
export function alignTail(heard: string[], script: string[], weights: number[], lo: number, hi: number): TailMatch | null {
  const from = Math.max(0, lo);
  const to = Math.min(script.length, hi);
  if (heard.length === 0 || to <= from) {
    return null;
  }

  let previousRow: Cell[] = new Array(to - from + 1).fill(EMPTY);
  let best: (Cell & { i: number; j: number }) | null = null;

  for (let i = 0; i < heard.length; i += 1) {
    const row: Cell[] = [{ score: 0, matches: 0, start: i + 1 }];
    for (let j = 1; j <= to - from; j += 1) {
      const sim = similarity(heard[i], script[from + j - 1]);
      const diagonal = previousRow[j - 1];
      const start = diagonal.score > 0 ? diagonal.start : i;
      const candidates: Cell[] = [
        sim > 0
          ? { score: diagonal.score + sim * weights[from + j - 1], matches: diagonal.matches + 1, start }
          : { score: diagonal.score + MISMATCH, matches: diagonal.matches, start },
        { ...previousRow[j], score: previousRow[j].score + GAP },
        { ...row[j - 1], score: row[j - 1].score + GAP }
      ];
      let cell = candidates.reduce((top, next) => (next.score > top.score ? next : top));
      if (cell.score <= 0) {
        cell = { score: 0, matches: 0, start: i + 1 };
      }
      row.push(cell);

      // A match ends on a heard word that matched, so trailing chatter can't pass for fresh.
      const endsHere = sim > 0 && cell === candidates[0];
      const fresh = i >= heard.length - FRESH_TOKENS;
      if (endsHere && fresh && (!best || cell.score > best.score || (cell.score === best.score && i > best.i))) {
        best = { ...cell, i, j };
      }
    }
    previousRow = row;
  }

  if (!best) {
    return null;
  }
  return {
    end: from + best.j - 1,
    matches: best.matches,
    score: best.score,
    ratio: best.matches / (best.i - best.start + 1)
  };
}

function passes(match: TailMatch | null, rules: Rules): match is TailMatch {
  return Boolean(
    match && match.matches >= rules.minMatches && match.score >= rules.minScore && match.ratio >= rules.minRatio
  );
}

function tokensOf(words: string[]) {
  return words.flatMap((word) => normalizeSpokenWord(word));
}

export class ScriptFollower {
  private readonly map: ScriptWordMap;
  private readonly tokens: string[] = [];
  private readonly weights: number[] = [];
  /** Script token index → word index, and word index → its last token index. */
  private readonly tokenWord: number[] = [];
  private readonly wordEndToken: number[] = [];
  private readonly wordBlock: number[] = [];
  private heard: string[] = [];
  private history: Array<{ at: number; cursor: number }> = [];
  private lastMatchAt: number;
  /** Index into map.blocks of the story that tossed to a package, while waiting it out. */
  private packageBlock: number | null = null;
  private ghost = -1;
  /** Last script word read; -1 before the first. */
  cursor = -1;
  /** The word the screen keeps at the playhead. Only moves back on a re-anchor or a re-read. */
  target = 0;

  constructor(map: ScriptWordMap, nextWord: number, now: number) {
    this.map = map;
    const counts = new Map<string, number>();
    for (const word of map.words) {
      for (const token of word.tokens) {
        this.tokens.push(token);
        this.tokenWord.push(word.index);
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
      this.wordEndToken.push(this.tokens.length - 1);
    }
    for (const token of this.tokens) {
      this.weights.push(tokenWeight(counts.get(token) ?? 1));
    }
    const blockIndex = new Map(map.blocks.map((block, index) => [block.id, index]));
    for (const word of map.words) {
      this.wordBlock.push(blockIndex.get(word.blockId) ?? -1);
    }
    this.lastMatchAt = now;
    this.anchor(nextWord, now);
  }

  /** Start following from `nextWord` (the word the anchor reads next), e.g. after a manual move. */
  anchor(nextWord: number, now: number) {
    const last = this.map.words.length - 1;
    this.cursor = Math.max(-1, Math.min(last, nextWord - 1));
    this.ghost = this.cursor;
    this.target = Math.max(0, Math.min(last, nextWord));
    this.heard = [];
    this.history = [{ at: now, cursor: this.cursor }];
    this.lastMatchAt = now;
    this.packageBlock = null;
  }

  mode(now: number): FollowMode {
    if (this.packageBlock !== null) {
      return "package";
    }
    const quietFor = now - this.lastMatchAt;
    if (quietFor < FOLLOW_HOLD_AFTER_MS) return "follow";
    return quietFor < FOLLOW_SEARCH_AFTER_MS ? "hold" : "search";
  }

  /**
   * Feed recognized words. `final` words are settled and can move the cursor; the rest are the
   * recognizer's current guess at the words after them and only nudge the screen ahead.
   * Returns true when the target word changed.
   */
  hear(words: string[], final: boolean, now: number) {
    const tokens = tokensOf(words);
    const before = this.target;
    if (final) {
      if (tokens.length === 0) {
        return false;
      }
      this.heard = [...this.heard, ...tokens].slice(-TAIL_TOKENS);
      this.commit(now);
    } else {
      this.guess(tokens, now);
    }
    return this.target !== before;
  }

  private rules(mode: FollowMode): Rules | null {
    const cursorToken = this.cursor < 0 ? -1 : this.wordEndToken[this.cursor];
    if (mode === "search") {
      // Everything ahead, plus the usual look-behind: never back to an earlier story.
      return { lo: cursorToken + 1 - LOOK_BEHIND_TOKENS, hi: this.tokens.length, minMatches: 6, minScore: 3, minRatio: 0.7 };
    }
    if (mode === "package") {
      const next = this.map.blocks[(this.packageBlock ?? -2) + 1];
      if (!next) {
        return null;
      }
      const lastWord = Math.min(next.lastWordIndex, next.firstWordIndex + PACKAGE_NEXT_WORDS - 1);
      const lo = next.firstWordIndex === 0 ? 0 : this.wordEndToken[next.firstWordIndex - 1] + 1;
      return { lo, hi: this.wordEndToken[lastWord] + 1, minMatches: 4, minScore: 2.5, minRatio: 0.7 };
    }
    return {
      lo: cursorToken + 1 - LOOK_BEHIND_TOKENS,
      hi: cursorToken + 1 + LOOK_AHEAD_TOKENS,
      minMatches: 3,
      minScore: 1.8,
      minRatio: 0.6
    };
  }

  /**
   * Search tries the usual nearby match first: picking up right after banter needs no extra proof.
   * A long package also searches ahead, in case the story after it was cut.
   */
  private bestMatch(mode: FollowMode, heard: string[], now: number) {
    const longPackage = mode === "package" && now - this.lastMatchAt >= PACKAGE_SEARCH_AFTER_MS;
    const tries =
      mode === "search"
        ? [this.rules("hold"), this.rules("search")]
        : longPackage
          ? [this.rules("package"), this.rules("search")]
          : [this.rules(mode)];
    for (const rules of tries) {
      const match = rules ? alignTail(heard, this.tokens, this.weights, rules.lo, rules.hi) : null;
      if (rules && passes(match, rules)) {
        return match;
      }
    }
    return null;
  }

  private commit(now: number) {
    const mode = this.mode(now);
    const match = this.bestMatch(mode, this.heard, now);
    if (!match) {
      return;
    }

    const word = this.tokenWord[match.end];
    // Backward only for a clear re-read: six or more words in a row, nearly all matching.
    if (word < this.cursor && !(match.matches >= 6 && match.ratio >= 0.8)) {
      return;
    }

    const jumped = word < this.cursor || mode === "search" || mode === "package";
    this.cursor = word;
    this.ghost = word;
    this.lastMatchAt = now;
    this.history = [...this.history.filter((entry) => now - entry.at <= SPEED_WINDOW_MS), { at: now, cursor: word }];
    this.packageBlock = this.tossedToPackage(word) ? this.wordBlock[word] : null;
    this.updateTarget(now, jumped);
  }

  private guess(tokens: string[], now: number) {
    const mode = this.mode(now);
    if (tokens.length === 0 || mode === "package" || mode === "search") {
      this.ghost = this.cursor;
      return;
    }
    const match = this.bestMatch(mode, [...this.heard, ...tokens].slice(-TAIL_TOKENS), now);
    const word = match ? this.tokenWord[match.end] : this.cursor;
    this.ghost = Math.min(Math.max(word, this.cursor), this.cursor + MAX_GHOST_WORDS);
    this.updateTarget(now, false);
  }

  /** The cursor reached the end of a story that rolls a package. */
  private tossedToPackage(word: number) {
    const block = this.map.blocks[this.wordBlock[word]];
    return Boolean(block?.rollAfter && word >= block.lastWordIndex - 1);
  }

  private wordsPerSecond() {
    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    const seconds = (last.at - first.at) / 1000;
    return seconds >= 2 ? Math.max(0, (last.cursor - first.cursor) / seconds) : 0;
  }

  private updateTarget(now: number, jumped: boolean) {
    const last = this.map.words.length - 1;
    const base = Math.max(this.cursor, this.ghost);
    const lead = this.mode(now) === "follow" ? Math.min(MAX_LEAD_WORDS, Math.round(this.wordsPerSecond() * (LATENCY_MS / 1000))) : 0;
    const next = Math.min(last, base + 1);
    const current = base >= 0 ? this.map.blocks[this.wordBlock[base]] : undefined;
    let target: number;
    if (current && base < current.lastWordIndex) {
      // The lead stops at the story's last word: moving on early would scroll the lines still
      // being read off the top.
      target = Math.min(next + lead, current.lastWordIndex);
    } else if (current) {
      // Story finished: on to the next one's first word, unless it tossed to a package.
      target = current.rollAfter ? base : next;
    } else {
      const block = this.map.blocks[this.wordBlock[next]];
      target = Math.min(next + lead, block ? block.lastWordIndex : last);
    }
    this.target = jumped ? target : Math.max(this.target, target);
  }
}
