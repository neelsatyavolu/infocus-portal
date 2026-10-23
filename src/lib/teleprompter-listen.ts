/*
 * Streaming speech-to-text for follow-along, minus the audio plumbing: a loudness gate that
 * finds where someone is talking, and a transcriber that re-reads the current utterance every
 * few hundred ms and settles words once two reads in a row agree on them ("local agreement").
 * The decoder is passed in, so this runs the same against the browser model and in tests.
 */

export type GateEvent = "silence" | "start" | "speech" | "end";

/** dB above the room's quiet level that counts as talking. */
const GATE_MARGIN_DB = 12;
/** Once talking, a word can dip this far under the threshold without ending the utterance. */
const GATE_HYSTERESIS_DB = 6;
const GATE_MIN_DB = -58;
const GATE_MAX_DB = -25;

export function levelDb(samples: Float32Array) {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return 20 * Math.log10(Math.sqrt(sum / Math.max(1, samples.length)) + 1e-9);
}

/**
 * Tracks the quiet level of the room (drops fast, rises over ~20 s) and calls a block speech
 * when it's well above it, so it works for a line feed and a room mic without a slider.
 */
export class SpeechGate {
  floorDb: number | null = null;
  private speaking = false;
  private quietBlocks = 0;

  constructor(private readonly endSilenceBlocks: number) {}

  get thresholdDb() {
    return Math.min(GATE_MAX_DB, Math.max(GATE_MIN_DB, (this.floorDb ?? GATE_MIN_DB) + GATE_MARGIN_DB));
  }

  push(db: number): GateEvent {
    const floor = this.floorDb ?? db;
    this.floorDb = floor + (db - floor) * (db < floor ? 0.5 : 0.01);
    const threshold = this.thresholdDb;

    if (!this.speaking) {
      if (db < threshold) {
        return "silence";
      }
      this.speaking = true;
      this.quietBlocks = 0;
      return "start";
    }

    this.quietBlocks = db < threshold - GATE_HYSTERESIS_DB ? this.quietBlocks + 1 : 0;
    if (this.quietBlocks >= this.endSilenceBlocks) {
      this.speaking = false;
      return "end";
    }
    return "speech";
  }
}

/** Lowercase letters and digits only, so "Vikings," and "vikings." agree. */
function comparable(word: string) {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** How many leading words two transcripts of the same audio agree on. */
export function agreedPrefix(previous: string[], next: string[]) {
  let count = 0;
  while (count < previous.length && count < next.length && comparable(previous[count]) === comparable(next[count])) {
    count += 1;
  }
  return count;
}

export function splitWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

export type TranscriptUpdate = { words: string[]; final: boolean };

export type TranscriberOptions = {
  /** Samples per pushed block (100 ms at 16 kHz is 1600). */
  blockSize: number;
  sampleRate: number;
  decode: (audio: Float32Array) => Promise<string>;
  onWords: (update: TranscriptUpdate) => void;
};

type Utterance = { blocks: Float32Array[]; levels: number[]; committed: number; previous: string[]; ended: boolean };

const STEP_MS = 400;
const PREROLL_MS = 300;
const END_SILENCE_MS = 600;
const MAX_UTTERANCE_MS = 10_000;
/** A long utterance is cut at its quietest moment in this last stretch, between words. */
const CUT_SEARCH_MS = 1500;
const MIN_DECODE_MS = 500;

export class StreamingTranscriber {
  readonly gate: SpeechGate;
  private readonly options: TranscriberOptions;
  private readonly blockMs: number;
  private preroll: Float32Array[] = [];
  private current: Utterance | null = null;
  private finals: Utterance[] = [];
  private blocksSinceDecode = 0;
  private busy = false;
  private stopped = false;

  constructor(options: TranscriberOptions) {
    this.options = options;
    this.blockMs = (options.blockSize / options.sampleRate) * 1000;
    this.gate = new SpeechGate(Math.ceil(END_SILENCE_MS / this.blockMs));
  }

  private blocksFor(ms: number) {
    return Math.max(1, Math.round(ms / this.blockMs));
  }

  /** Feed one block of mono audio. Returns its level, for a meter. */
  push(block: Float32Array) {
    const db = levelDb(block);
    const event = this.gate.push(db);

    if (event === "start") {
      this.current = { blocks: [...this.preroll, block], levels: [...this.preroll.map(levelDb), db], committed: 0, previous: [], ended: false };
      this.preroll = [];
      this.blocksSinceDecode = 0;
    } else if (this.current) {
      this.current.blocks.push(block);
      this.current.levels.push(db);
      this.blocksSinceDecode += 1;
      if (event === "end") {
        this.finish(this.current);
        this.current = null;
      } else if (this.current.blocks.length >= this.blocksFor(MAX_UTTERANCE_MS)) {
        this.cutLongUtterance(this.current);
      }
    } else {
      this.preroll = [...this.preroll, block].slice(-this.blocksFor(PREROLL_MS));
    }

    this.schedule();
    return { db, thresholdDb: this.gate.thresholdDb, speaking: this.current !== null };
  }

  stop() {
    this.stopped = true;
  }

  private finish(utterance: Utterance) {
    utterance.ended = true;
    this.finals.push(utterance);
  }

  private cutLongUtterance(utterance: Utterance) {
    const searchFrom = utterance.blocks.length - this.blocksFor(CUT_SEARCH_MS);
    let cut = searchFrom;
    for (let index = searchFrom; index < utterance.levels.length; index += 1) {
      if (utterance.levels[index] < utterance.levels[cut]) {
        cut = index;
      }
    }
    const carried: Utterance = {
      blocks: utterance.blocks.slice(cut),
      levels: utterance.levels.slice(cut),
      committed: 0,
      previous: [],
      ended: false
    };
    utterance.blocks = utterance.blocks.slice(0, cut);
    utterance.levels = utterance.levels.slice(0, cut);
    this.finish(utterance);
    this.current = carried;
    this.blocksSinceDecode = 0;
  }

  /** One decode at a time: finished utterances first, then a fresh read of the current one. */
  private schedule() {
    if (this.busy || this.stopped) {
      return;
    }
    const final = this.finals.shift();
    if (final) {
      void this.run(final, true);
      return;
    }
    const current = this.current;
    if (current && this.blocksSinceDecode >= this.blocksFor(STEP_MS) && current.blocks.length >= this.blocksFor(MIN_DECODE_MS)) {
      this.blocksSinceDecode = 0;
      void this.run(current, false);
    }
  }

  private async run(utterance: Utterance, final: boolean) {
    this.busy = true;
    const audio = concat(utterance.blocks);
    let words: string[] = [];
    try {
      words = splitWords(await this.options.decode(audio));
    } catch {
      // A failed read is the same as hearing nothing; the next read tries again.
    }
    this.busy = false;
    if (this.stopped) {
      return;
    }

    // A fresh read that comes back after its utterance ended is dropped: the final read covers it.
    if (final) {
      this.emitFinal(utterance, words);
    } else if (!utterance.ended) {
      this.emitPartial(utterance, words);
    }
    this.schedule();
  }

  private emitFinal(utterance: Utterance, words: string[]) {
    // Never re-send settled words, even if the last read disagrees with them.
    const fresh = words.slice(utterance.committed);
    if (fresh.length > 0) {
      this.options.onWords({ words: fresh, final: true });
    }
    this.options.onWords({ words: [], final: false });
  }

  private emitPartial(utterance: Utterance, words: string[]) {
    const agreed = agreedPrefix(utterance.previous, words);
    if (agreed > utterance.committed) {
      this.options.onWords({ words: words.slice(utterance.committed, agreed), final: true });
      utterance.committed = agreed;
    }
    utterance.previous = words;
    this.options.onWords({ words: words.slice(utterance.committed), final: false });
  }
}

function concat(blocks: Float32Array[]) {
  const audio = new Float32Array(blocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    audio.set(block, offset);
    offset += block.length;
  }
  return audio;
}
