import { describe, expect, it } from "vitest";
import { SpeechGate, StreamingTranscriber, agreedPrefix, type TranscriptUpdate } from "@/src/lib/teleprompter-listen";

const BLOCK = 1600;
const SENTENCE = "Good morning Paly today is Friday the twenty third of October and this is InFocus News".split(" ");

function block(amplitude: number) {
  return new Float32Array(BLOCK).fill(amplitude);
}

async function settle() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

/** A fake recognizer that "hears" one word of SENTENCE per 0.3 s of audio. */
function fakeTranscriber(updates: TranscriptUpdate[], lengths: number[] = []) {
  return new StreamingTranscriber({
    blockSize: BLOCK,
    sampleRate: 16000,
    decode: async (audio) => {
      lengths.push(audio.length / 16000);
      return SENTENCE.slice(0, Math.floor(audio.length / 16000 / 0.3)).join(" ");
    },
    onWords: (update) => updates.push(update)
  });
}

describe("SpeechGate", () => {
  it("opens on speech and closes after a pause", () => {
    const gate = new SpeechGate(6);
    const quiet = Array.from({ length: 10 }, () => gate.push(-60));
    expect(new Set(quiet)).toEqual(new Set(["silence"]));
    expect(gate.push(-20)).toBe("start");
    expect(gate.push(-22)).toBe("speech");
    const pause = Array.from({ length: 6 }, () => gate.push(-60));
    expect(pause.slice(0, 5)).toEqual(Array(5).fill("speech"));
    expect(pause[5]).toBe("end");
  });

  it("learns a steady noise floor so hum stops counting as speech", () => {
    const gate = new SpeechGate(6);
    gate.push(-60);
    const events = Array.from({ length: 600 }, () => gate.push(-40));
    expect(events.at(-1)).toBe("silence");
  });
});

describe("agreedPrefix", () => {
  it("counts leading words two reads agree on, ignoring case and punctuation", () => {
    expect(agreedPrefix(["Good", "morning,", "Paly"], ["good", "morning", "Pauly", "today"])).toBe(2);
    expect(agreedPrefix([], ["good"])).toBe(0);
  });
});

describe("StreamingTranscriber", () => {
  it("settles each word once, in order, and clears the guess at the end", async () => {
    const updates: TranscriptUpdate[] = [];
    const transcriber = fakeTranscriber(updates);
    for (let index = 0; index < 5; index += 1) transcriber.push(block(0));
    for (let index = 0; index < 30; index += 1) {
      transcriber.push(block(0.2));
      await settle();
    }
    for (let index = 0; index < 10; index += 1) {
      transcriber.push(block(0));
      await settle();
    }

    const settled = updates.filter((update) => update.final).flatMap((update) => update.words);
    expect(settled).toEqual(SENTENCE.slice(0, settled.length));
    expect(settled.length).toBeGreaterThanOrEqual(9);
    expect(updates.some((update) => !update.final && update.words.length > 0)).toBe(true);
    expect(updates.at(-1)).toEqual({ words: [], final: false });
  });

  it("hands over each finished utterance, marking the ones said after a pause", async () => {
    const utterances: Array<{ words: string[]; afterPause: boolean }> = [];
    const transcriber = new StreamingTranscriber({
      blockSize: BLOCK,
      sampleRate: 16000,
      decode: async (audio) => SENTENCE.slice(0, Math.floor(audio.length / 16000 / 0.3)).join(" "),
      onWords: () => undefined,
      onUtterance: (utterance) => utterances.push(utterance)
    });
    for (const loud of [false, false, ...Array(15).fill(true), ...Array(10).fill(false)]) {
      transcriber.push(block(loud ? 0.2 : 0));
      await settle();
    }
    expect(utterances).toHaveLength(1);
    expect(utterances[0].afterPause).toBe(true);
    expect(utterances[0].words.slice(0, 3)).toEqual(["Good", "morning", "Paly"]);
  });

  it("counts a cut at a short pause as after a pause, but not a forced cut", async () => {
    const utterances: Array<{ words: string[]; afterPause: boolean }> = [];
    const transcriber = new StreamingTranscriber({
      blockSize: BLOCK,
      sampleRate: 16000,
      decode: async (audio) => SENTENCE.slice(0, Math.floor(audio.length / 16000 / 0.3)).join(" "),
      onWords: () => undefined,
      onUtterance: (utterance) => utterances.push(utterance)
    });
    transcriber.push(block(0));
    // 9 s of talk, a 0.3 s gap (too short to end the utterance), then 13 s of talk without a break.
    const talk = (blocks: number) => Array.from({ length: blocks }, (_, index) => (index % 3 === 0 ? 0.25 : 0.2));
    const levels = [...talk(90), ...Array(3).fill(0.0005), ...talk(130), ...Array(10).fill(0)];
    for (const level of levels) {
      transcriber.push(block(level));
      await settle();
    }
    expect(utterances.map((utterance) => utterance.afterPause)).toEqual([true, true, false]);
  });

  it("cuts long speech into reads of at most twelve seconds", async () => {
    const lengths: number[] = [];
    const transcriber = fakeTranscriber([], lengths);
    transcriber.push(block(0));
    for (let index = 0; index < 400; index += 1) {
      transcriber.push(block(0.2));
      await settle();
    }
    expect(Math.max(...lengths)).toBeLessThanOrEqual(12.01);
    expect(lengths.length).toBeGreaterThan(10);
  });

  it("never settles the same word twice when long speech is cut", async () => {
    // Each block is one "word", named by a tiny marker in its first sample.
    const updates: TranscriptUpdate[] = [];
    const transcriber = new StreamingTranscriber({
      blockSize: BLOCK,
      sampleRate: 16000,
      decode: async (audio) => {
        const words: string[] = [];
        for (let offset = 0; offset + BLOCK <= audio.length; offset += BLOCK) {
          words.push(`w${Math.round(audio[offset] * 1e5)}`);
        }
        return words.join(" ");
      },
      onWords: (update) => updates.push(update)
    });
    transcriber.push(block(0));
    for (let index = 1; index <= 300; index += 1) {
      const loud = block(index % 23 === 0 ? 0.12 : 0.2);
      loud[0] = index * 1e-5;
      transcriber.push(loud);
      await settle();
    }
    for (let index = 301; index <= 310; index += 1) {
      const quiet = block(0);
      quiet[0] = index * 1e-5;
      transcriber.push(quiet);
      await settle();
    }
    const settled = updates.filter((update) => update.final).flatMap((update) => update.words);
    expect(new Set(settled).size).toBe(settled.length);
    expect(settled.length).toBeGreaterThan(250);
  });
});
