import { of, Subscription } from "rxjs";
import type { MeetingServerMessage, MeetingTrackMetadata } from "@/src/lib/meetings/protocol";
import { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { createMediaSession, withBackoff, type MediaTicket, type MeetingMediaSession } from "@/src/lib/meetings/client/media-session";
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
    __scribe?: {
      setKey: (key: string, epoch: number) => Promise<void>;
      /** A fresh room ticket from the Drive (re-ticketing): used for every later reconnect and proxy call. */
      setTicket?: (token: string) => void;
      leave: () => Promise<void>;
    };
  }
}

export type ScribeParams = { mid: string; room: string; token: string; key: string; epoch: number };

const CHUNK_MS = 10_000;
/** A dead or failed SFU session is rebuilt after this long (until the next welcome or leave). */
const MEDIA_RESTART_DELAY_MS = 5_000;
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
  /** The media session died while there was nobody to record; rebuilt on the next speaker. */
  private mediaStale = false;
  /** The current room ticket (the Drive swaps it via setTicket before the 4 h one runs out). */
  private readonly ticket: MediaTicket;

  constructor(
    private readonly params: ScribeParams,
    private readonly onStatus: (status: string) => void
  ) {
    this.ticket = { current: params.token };
  }

  setTicket(token: string) {
    if (token) this.ticket.current = token;
  }

  async start() {
    await this.e2ee.setKey(this.params.key, this.params.epoch);
    // Media starts on the room's welcome: the SFU proxy needs an open room socket for this uid.
    this.socket = new RoomSocket({
      roomUrl: this.params.room,
      meetingId: this.params.mid,
      // A 4 h ticket; the Drive re-tickets every ~2 h (setTicket) and on each rekey.
      getToken: () => this.ticket.current,
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
    this.mediaStale = false;
    await Promise.all([...this.speakers.keys()].map((uid) => this.stopSpeaker(uid)));
    this.media?.close();
    this.media = null;
    try {
      const media = await createMediaSession({
        roomUrl: this.params.room,
        meetingId: this.params.mid,
        ticket: this.ticket,
        e2ee: this.e2ee,
        // A session the SFU never accepted, or a peer connection that stays down, records nothing
        // while the room socket looks healthy: rebuild it.
        onZombie: () => this.restartMediaSoon(generation, "Media connection lost")
      });
      if (this.done || generation !== this.mediaGeneration) {
        media.close();
        return;
      }
      this.media = media;
      this.sync();
    } catch {
      this.restartMediaSoon(generation, "Couldn't connect media");
    }
  }

  /** Rebuilds media after a delay, unless a newer session (welcome) or leave() got there first. */
  private restartMediaSoon(generation: number, status: string) {
    if (this.done || generation !== this.mediaGeneration) return;
    // Nothing to record: a receive-only session with no pulls never connects, so rebuilding now
    // would just loop. sync() rebuilds once someone with audio is in the room.
    if (this.speakers.size === 0) {
      this.mediaStale = true;
      return;
    }
    this.onStatus(`${status}; retrying`);
    setTimeout(() => {
      if (!this.done && generation === this.mediaGeneration) void this.resetMedia();
    }, MEDIA_RESTART_DELAY_MS);
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
    if (message.t === "rekey") {
      // The Scribe can't fetch keys itself (no session): the Drive pushes them via __scribe.setKey.
      this.socket?.send({ t: "diag", kind: "event", data: { what: "scribe_rekey", epoch: message.epoch } });
    }
    this.sync();
  }

  private sync() {
    if (this.done || !this.media) return;
    if (this.mediaStale && this.hasAudioToRecord()) {
      void this.resetMedia(); // Its sync() pulls everyone on the fresh session.
      return;
    }
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

  private hasAudioToRecord() {
    return Object.values(this.state.participants).some((p) => !p.isScribe && p.tracks.audio?.sessionId && p.tracks.audio.trackName);
  }

  private startSpeaker(uid: string, name: string, key: string, meta: MeetingTrackMetadata) {
    const media = this.media;
    if (!media) return;
    const speaker: Speaker = { trackKey: key, pull: Subscription.EMPTY, recorder: null, audio: null };
    this.speakers.set(uid, speaker);
    // Retried until the speaker leaves (stopSpeaker): giving up left a 10 s hole in the transcript.
    speaker.pull = media.partyTracks
      .pull(of({ ...meta, location: "remote" as const }))
      .pipe(withBackoff("scribe.pull", Infinity))
      // A re-pull emits a new track: start a new recorder (seq 0) for it.
      .subscribe((track) => this.record(speaker, uid, name, track));
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
