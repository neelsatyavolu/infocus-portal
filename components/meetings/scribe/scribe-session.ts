import { of, Subscription } from "rxjs";
import type { MeetingServerMessage, MeetingTrackMetadata } from "@/src/lib/meetings/protocol";
import { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { createMediaSession, withBackoff, type MeetingMediaSession } from "@/src/lib/meetings/client/media-session";
import { RoomSocket } from "@/src/lib/meetings/client/room-socket";
import { INITIAL_ROOM_STATE, roomReducer, type RoomState } from "@/src/lib/meetings/client/room-state";

/**
 * Drive Scribe client: joins as role "scribe" (never publishes), pulls every remote audio track and
 * hands 10-second WebM/Opus chunks to the headless browser host via window.scribeChunk.
 * seq restarts at 0 for each new MediaRecorder; startMs is that recorder's start (epoch ms).
 */

declare global {
  interface Window {
    scribeChunk?: (uid: string, name: string, startMs: number, seq: number, b64: string) => unknown;
    scribeEvent?: (event: "ended" | "removed") => unknown;
    __scribe?: { setKey: (key: string, epoch: number) => Promise<void>; leave: () => Promise<void> };
  }
}

export type ScribeParams = { mid: string; room: string; token: string; key: string; epoch: number };

const CHUNK_MS = 10_000;
const MIME = "audio/webm;codecs=opus";

export function readScribeParams(hash: string): ScribeParams | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const mid = params.get("mid");
  const room = params.get("room");
  const token = params.get("token");
  const key = params.get("key");
  const rawEpoch = params.get("epoch");
  const epoch = Number(rawEpoch);
  if (!mid || !room || !token || !key || !rawEpoch || !Number.isInteger(epoch) || epoch < 0) return null;
  return { mid, room, token, key, epoch };
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type Speaker = { trackKey: string; pull: Subscription; recorder: MediaRecorder | null; audio: HTMLAudioElement | null };

function trackKey(meta: MeetingTrackMetadata) {
  return `${meta.sessionId}/${meta.trackName}`;
}

export class ScribeSession {
  private state: RoomState = INITIAL_ROOM_STATE;
  private socket: RoomSocket | null = null;
  private media: MeetingMediaSession | null = null;
  private readonly e2ee = new MeetingE2ee();
  private readonly speakers = new Map<string, Speaker>();
  private readonly pendingChunks = new Set<Promise<void>>();
  private done = false;
  private mediaGeneration = 0;

  constructor(
    private readonly params: ScribeParams,
    private readonly onStatus: (status: string) => void
  ) {}

  async start() {
    await this.e2ee.setKey(this.params.key, this.params.epoch);
    // Media starts on the room's welcome: the SFU proxy needs an open room socket for this uid.
    this.socket = new RoomSocket({
      roomUrl: this.params.room,
      meetingId: this.params.mid,
      token: this.params.token,
      onMessage: (message) => this.handle(message),
      onStatus: (status) => {
        if (!this.done) this.onStatus(status === "open" ? this.recordingStatus() : `Room ${status}`);
      }
    });
    this.socket.connect();
  }

  /** Every (re)connect gets a fresh SFU session; recorders restart at seq 0 on re-pull. */
  private async resetMedia() {
    const generation = ++this.mediaGeneration;
    await Promise.all([...this.speakers.keys()].map((uid) => this.stopSpeaker(uid)));
    this.media?.close();
    this.media = null;
    try {
      const media = await createMediaSession({
        roomUrl: this.params.room,
        meetingId: this.params.mid,
        token: this.params.token,
        e2ee: this.e2ee
      });
      if (this.done || generation !== this.mediaGeneration) {
        media.close();
        return;
      }
      this.media = media;
      this.sync();
    } catch {
      this.onStatus("Couldn't connect media");
    }
  }

  setKey(key: string, epoch: number) {
    return this.e2ee.setKey(key, epoch);
  }

  async leave() {
    if (this.done) return;
    this.done = true;
    const stops = [...this.speakers.keys()].map((uid) => this.stopSpeaker(uid));
    await Promise.all(stops);
    await Promise.all([...this.pendingChunks]);
    this.socket?.close();
    this.media?.close();
    this.e2ee.destroy();
    this.onStatus("Left");
  }

  private recordingStatus() {
    return `Recording ${this.speakers.size} track${this.speakers.size === 1 ? "" : "s"}`;
  }

  private handle(message: MeetingServerMessage) {
    this.state = roomReducer(this.state, message);
    if (message.t === "ended" || message.t === "removed") {
      void this.leave().then(() => {
        if (typeof window.scribeEvent === "function") window.scribeEvent(message.t as "ended" | "removed");
      });
      return;
    }
    if (message.t === "welcome") {
      void this.resetMedia();
      return;
    }
    this.sync();
  }

  private sync() {
    if (this.done || !this.media) return;
    const present = new Set<string>();
    for (const participant of Object.values(this.state.participants)) {
      const meta = participant.tracks.audio;
      if (participant.isScribe || !meta?.sessionId || !meta.trackName) continue;
      present.add(participant.uid);
      const key = trackKey(meta);
      const existing = this.speakers.get(participant.uid);
      if (existing?.trackKey === key) continue;
      if (existing) void this.stopSpeaker(participant.uid);
      this.startSpeaker(participant.uid, participant.name, key, meta);
    }
    for (const uid of [...this.speakers.keys()]) {
      if (!present.has(uid)) void this.stopSpeaker(uid);
    }
    this.onStatus(this.recordingStatus());
  }

  private startSpeaker(uid: string, name: string, key: string, meta: MeetingTrackMetadata) {
    const media = this.media;
    if (!media) return;
    const speaker: Speaker = { trackKey: key, pull: Subscription.EMPTY, recorder: null, audio: null };
    this.speakers.set(uid, speaker);
    speaker.pull = media.partyTracks.pull(of({ ...meta, location: "remote" as const })).pipe(withBackoff()).subscribe({
      // A re-pull emits a new track: start a new recorder (seq 0) for it.
      next: (track) => this.record(speaker, uid, name, track),
      error: () => this.onStatus("Couldn't pull a track")
    });
  }

  private record(speaker: Speaker, uid: string, name: string, track: MediaStreamTrack) {
    speaker.recorder?.stop();
    const stream = new MediaStream([track]);
    // Remote WebRTC audio only flows into MediaRecorder reliably while a media element plays it.
    const audio = speaker.audio ?? new Audio();
    audio.muted = true;
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    speaker.audio = audio;

    const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(MIME) ? { mimeType: MIME } : undefined);
    const startMs = Date.now();
    let seq = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      const chunkSeq = seq;
      seq += 1;
      const pending = blobToBase64(event.data)
        .then((b64) => {
          if (typeof window.scribeChunk === "function") void window.scribeChunk(uid, name, startMs, chunkSeq, b64);
        })
        .catch(() => this.onStatus("Couldn't read an audio chunk"))
        .finally(() => this.pendingChunks.delete(pending));
      this.pendingChunks.add(pending);
    };
    recorder.start(CHUNK_MS);
    speaker.recorder = recorder;
  }

  private stopSpeaker(uid: string) {
    const speaker = this.speakers.get(uid);
    this.speakers.delete(uid);
    if (!speaker) return Promise.resolve();
    const release = () => {
      speaker.pull.unsubscribe();
      if (speaker.audio) speaker.audio.srcObject = null;
    };
    const recorder = speaker.recorder;
    if (!recorder || recorder.state === "inactive") {
      release();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      // The final dataavailable fires before "stop"; release the track only after it.
      recorder.addEventListener(
        "stop",
        () => {
          release();
          resolve();
        },
        { once: true }
      );
      recorder.stop();
    });
  }
}
