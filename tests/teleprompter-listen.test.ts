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

  it("cuts long speech into reads of at most ten seconds", async () => {
    const lengths: number[] = [];
    const transcriber = fakeTranscriber([], lengths);
    transcriber.push(block(0));
    for (let index = 0; index < 250; index += 1) {
      transcriber.push(block(index % 37 === 0 ? 0.05 : 0.2));
      await settle();
    }
    expect(Math.max(...lengths)).toBeLessThanOrEqual(10.01);
    expect(lengths.length).toBeGreaterThan(10);
  });
});
