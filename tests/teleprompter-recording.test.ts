import { describe, expect, it } from "vitest";
import {
  MAX_RECORDING_MS,
  PrompterRecording,
  RECORDING_ID_PATTERN,
  RECORDING_SAMPLE_RATE,
  encodeWav,
  makeRecordingId
} from "@/src/lib/teleprompter-recording";

const META = { startedAt: "2026-10-29T16:12:00.000Z", model: "fast", channel: "mix", secondMicrophone: false, userAgent: "test" };

describe("encodeWav", () => {
  it("writes a 16-bit mono WAV header and the samples", () => {
    const bytes = encodeWav([new Int16Array([1, -2]), new Int16Array([3])], 16000);
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([1, -2, 3]);
    expect(bytes.length).toBe(50);
  });
});

describe("PrompterRecording", () => {
  it("records the audio and stamps each event with its place in it", () => {
    const recording = new PrompterRecording("0912-abc123", META, 1000);
    recording.log({ type: "status", phase: "listening" }, 1000);
    recording.addAudio(new Float32Array([0.5, -1.5, 0]));
    recording.log({ type: "words", words: ["Good", "morning"], final: true }, 1250.4);
    const wav = new DataView(recording.wav().buffer);
    expect(wav.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff));
    // Clipped to full scale.
    expect(wav.getInt16(46, true)).toBe(-0x7fff);
    const log = JSON.parse(recording.logJson());
    expect(log).toMatchObject({ version: 1, id: "0912-abc123", sampleRate: RECORDING_SAMPLE_RATE, meta: META });
    expect(log.events).toEqual([
      { type: "status", phase: "listening", sample: 0, ms: 0 },
      { type: "words", words: ["Good", "morning"], final: true, sample: 3, ms: 250 }
    ]);
  });

  it("stops taking audio and events at the length limit", () => {
    const recording = new PrompterRecording("0912-abc123", META, 0);
    const block = new Float32Array(RECORDING_SAMPLE_RATE * 60);
    for (let minute = 0; minute < MAX_RECORDING_MS / 60_000 + 2; minute += 1) recording.addAudio(block);
    expect(recording.full).toBe(true);
    expect(recording.durationMs).toBe(MAX_RECORDING_MS);
    recording.log({ type: "anchor", word: 3 }, 5);
    expect(JSON.parse(recording.logJson()).events).toEqual([]);
  });
});

describe("makeRecordingId", () => {
  it("starts with the local time and matches what the server accepts", () => {
    const id = makeRecordingId(new Date(2026, 9, 29, 9, 5), () => 0.5);
    expect(id).toBe("0905-ssssss");
    expect(RECORDING_ID_PATTERN.test(makeRecordingId(new Date()))).toBe(true);
    expect(RECORDING_ID_PATTERN.test("../../etc")).toBe(false);
  });
});
