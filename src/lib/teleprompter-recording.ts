/*
 * A run-mode recording for tuning Auto follow: the exact 16 kHz audio the speech model heard,
 * and a log of what it made of it (each read, utterance, voice command, and where the follower
 * was), every entry stamped with its position in the audio. Played back offline, the two show
 * why it missed a command or fell behind. Pure; the upload is in run mode's
 * teleprompter-recording-upload.ts.
 */

export const RECORDING_SAMPLE_RATE = 16000;
/** Stops by itself after this long, so a forgotten recording can't fill the computer's memory (about 115 MB). */
export const MAX_RECORDING_MS = 60 * 60 * 1000;
/** "0912-k3f9a2": the local start time, then a random tag. Files are `<id>.wav` and `<id>.json`. */
export const RECORDING_ID_PATTERN = /^\d{4}-[a-z0-9]{6}$/;

export type RecordingEvent =
  | { type: "script"; docId: string; showDate: string | null; sections: Array<{ id: string; label: string; content: string }> }
  | { type: "status"; phase: string; detail?: string }
  | { type: "words"; words: string[]; final: boolean }
  | { type: "utterance"; words: string[]; afterPause: boolean; endedAtPause: boolean }
  | { type: "command"; result: unknown }
  | { type: "follow"; cursor: number; target: number; mode: string }
  | { type: "anchor"; word: number }
  | { type: "end-of-speech"; target: number };

export type RecordingMeta = {
  startedAt: string;
  model: string;
  channel: string;
  secondMicrophone: boolean;
  userAgent: string;
};

type StampedEvent = RecordingEvent & { sample: number; ms: number };

export function makeRecordingId(now: Date, random: () => number = Math.random) {
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const tag = Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("");
  return `${time}-${tag}`;
}

export class PrompterRecording {
  private readonly chunks: Int16Array[] = [];
  private readonly events: StampedEvent[] = [];
  /** Audio samples recorded so far. */
  samples = 0;

  constructor(
    readonly id: string,
    readonly meta: RecordingMeta,
    private readonly startedAtMs: number
  ) {}

  get durationMs() {
    return (this.samples / RECORDING_SAMPLE_RATE) * 1000;
  }

  /** Reached MAX_RECORDING_MS: audio after this is dropped. */
  get full() {
    return this.durationMs >= MAX_RECORDING_MS;
  }

  /** One block of the mono 16 kHz audio the speech model gets. */
  addAudio(block: Float32Array) {
    if (this.full) return;
    const pcm = new Int16Array(block.length);
    for (let index = 0; index < block.length; index += 1) {
      pcm[index] = Math.round(Math.max(-1, Math.min(1, block[index])) * 0x7fff);
    }
    this.chunks.push(pcm);
    this.samples += block.length;
  }

  /** `now` is performance.now(); `sample` lines the event up with the audio. */
  log(event: RecordingEvent, now: number) {
    if (this.full) return;
    this.events.push({ ...event, sample: this.samples, ms: Math.round(now - this.startedAtMs) });
  }

  wav() {
    return encodeWav(this.chunks, RECORDING_SAMPLE_RATE);
  }

  logJson() {
    return JSON.stringify({
      version: 1,
      id: this.id,
      sampleRate: RECORDING_SAMPLE_RATE,
      durationMs: Math.round(this.durationMs),
      meta: this.meta,
      events: this.events
    });
  }
}

/** 16-bit mono PCM WAV. */
export function encodeWav(chunks: Int16Array[], sampleRate: number) {
  const samples = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return bytes;
}
