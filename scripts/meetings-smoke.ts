/**
 * InFocus Meetings media-path smoke test (terminal only, no browser).
 *
 * Two fake participants join a throwaway meeting on the live meeting-room Worker. A pushes an
 * E2EE-encrypted Opus track and a VP8 track through the partytracks proxy to Cloudflare Realtime;
 * B pulls both, decrypts every frame with the same meeting key and checks counts, integrity and
 * latency. Then it runs negative checks (adm:false, bad Origin, someone else's session) and cleans up.
 *
 * Run (the secret comes from 1Password at run time; never print it):
 *   MEETING_ROOM_SECRET="$(op --account <account> item get <item> --fields MEETING_ROOM_SECRET --reveal)" \
 *     npm run smoke:meetings
 *
 * Env: MEETING_ROOM_SECRET (required), MEETING_ROOM_URL (default https://meet-api.infocuspaly.com),
 *      SMOKE_ORIGIN (default https://meet.infocuspaly.com), SMOKE_SECONDS (default 10).
 * The room reports `started` to the Portal for this unknown meeting id; the Portal answers 404 and
 * the room logs a failed report. That is expected. At the end the script sends the room a Portal
 * `ended` event, which clears its storage, so no `empty` report retries follow.
 * Exit code: 0 when every check passes, 1 otherwise.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { RtpHeader, RtpPacket, type MediaStreamTrack, type RTCPeerConnection, type RTCRtpTransceiver } from "werift";
import { decryptFrame, deriveMeetingKey, encryptFrame } from "../src/lib/meetings/client/frame-crypto";
import type { MeetingServerMessage, MeetingTrackMetadata, MeetingTracks } from "../src/lib/meetings/protocol";
import {
  check,
  closeTracks as closeRoomTracks,
  describe,
  describePair,
  finish,
  info,
  isOk,
  isWelcome,
  newMeetingId,
  newPeer,
  ORIGIN,
  percentile,
  requireSecret,
  ROOM_URL,
  roomClient,
  selectedPair,
  STEP_TIMEOUT_MS,
  timeout,
  waitConnected,
  type Json,
  type Kind,
  type RoomSocket
} from "./meetings-e2e/common";
import { headerLengthOf, stripVp8Descriptor } from "./meetings-e2e/media";

const SECONDS = Number(process.env.SMOKE_SECONDS ?? 10);
const MEETING_ID = newMeetingId("smoke");
const room = roomClient(MEETING_ID);
const { ticket, proxy } = room;
const AUDIO_MS = 20;
const VIDEO_FPS = 30;
const KEYFRAME_EVERY = VIDEO_FPS;
const MAGIC = 0x534d4b31; // "SMK1"
const AUDIO_TOC = 0x78; // Opus TOC: config 15 (hybrid FB 20 ms), mono, one frame
const VP8_DESCRIPTOR = 0x10; // S=1, PID=0, no extensions

const candidateTypes = async (pc: RTCPeerConnection) => describePair(await selectedPair(pc));
const closeTracks = (pc: RTCPeerConnection, sessionId: string, token: string, transceivers: RTCRtpTransceiver[]) =>
  closeRoomTracks(room, pc, sessionId, token, transceivers);

// ---------------------------------------------------------------------------
// Fake media: plaintext frames carry magic, kind, counter, send time and checkable padding
// ---------------------------------------------------------------------------

const BODY_BYTES: Record<Kind, number> = { audio: 60, video: 400 };

function vp8Header(counter: number, bodyLength: number): Uint8Array {
  const key = counter % KEYFRAME_EVERY === 0;
  const size = bodyLength; // first_part_size (19 bits); any plausible value works for the SFU
  const tag = [(key ? 0 : 1) | (1 << 4) | ((size & 0x7) << 5), (size >> 3) & 0xff, (size >> 11) & 0xff];
  // Key frame: start code 9d 01 2a, then 320x240 (14-bit width/height, scale 0).
  return Uint8Array.from(key ? [...tag, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00] : tag);
}

function plainFrame(kind: Kind, counter: number): Uint8Array<ArrayBuffer> {
  const header = kind === "audio" ? Uint8Array.of(AUDIO_TOC) : vp8Header(counter, BODY_BYTES.video);
  const body = Buffer.alloc(BODY_BYTES[kind]);
  body.writeUInt32BE(MAGIC, 0);
  body.writeUInt8(kind === "audio" ? 1 : 2, 4);
  body.writeUInt32BE(counter, 5);
  body.writeDoubleBE(performance.timeOrigin + performance.now(), 9);
  for (let i = 17; i < body.length; i += 1) body[i] = (counter + i) & 0xff;
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

type Parsed = { ok: true; counter: number; sentAt: number } | { ok: false; reason: string };

function parseBody(kind: Kind, plain: Uint8Array): Parsed {
  const frame = Buffer.from(plain);
  const body = frame.subarray(headerLengthOf(kind, frame));
  if (body.length !== BODY_BYTES[kind]) return { ok: false, reason: `length ${body.length}` };
  if (body.readUInt32BE(0) !== MAGIC) return { ok: false, reason: "magic" };
  if (body.readUInt8(4) !== (kind === "audio" ? 1 : 2)) return { ok: false, reason: "kind" };
  const counter = body.readUInt32BE(5);
  for (let i = 17; i < body.length; i += 1) if (body[i] !== ((counter + i) & 0xff)) return { ok: false, reason: "padding" };
  if (kind === "video") {
    const expected = vp8Header(counter, BODY_BYTES.video);
    if (!expected.every((byte, i) => frame[i] === byte)) return { ok: false, reason: "vp8 header" };
  }
  return { ok: true, counter, sentAt: body.readDoubleBE(9) };
}

type Sender = { sent: number; stop: () => void };

function startSending(transceivers: Record<Kind, RTCRtpTransceiver>, key: CryptoKey): Record<Kind, Sender> {
  const state = {
    audio: { sent: 0, seq: 0, ts: 0 },
    video: { sent: 0, seq: 0, ts: 0 }
  };
  const started = performance.now();
  let stopped = { audio: false, video: false };

  async function sendOne(kind: Kind) {
    const s = state[kind];
    const counter = s.sent;
    s.sent += 1;
    const plain = plainFrame(kind, counter);
    const sealed = new Uint8Array(await encryptFrame(key, 0, plain.buffer, headerLengthOf(kind, plain)));
    const payload = kind === "audio" ? Buffer.from(sealed) : Buffer.concat([Buffer.of(VP8_DESCRIPTOR), sealed]);
    const header = new RtpHeader({ payloadType: 96, sequenceNumber: s.seq & 0xffff, timestamp: s.ts >>> 0, marker: true });
    s.seq += 1;
    s.ts += kind === "audio" ? 960 : 90_000 / VIDEO_FPS;
    await transceivers[kind].sender.sendRtp(new RtpPacket(header, payload));
  }

  const timer = setInterval(() => {
    const elapsed = performance.now() - started;
    while (!stopped.audio && state.audio.sent < Math.floor(elapsed / AUDIO_MS) + 1) void sendOne("audio");
    while (!stopped.video && state.video.sent < Math.floor((elapsed * VIDEO_FPS) / 1000) + 1) void sendOne("video");
    if (stopped.audio && stopped.video) clearInterval(timer);
  }, 5);

  const sender = (kind: Kind): Sender => ({
    get sent() {
      return state[kind].sent;
    },
    stop: () => {
      stopped = { ...stopped, [kind]: true };
    }
  });
  return { audio: sender("audio"), video: sender("video") };
}

type Receiver = { packets: number; decrypted: number; failed: number; bad: string[]; counters: Set<number>; latencies: number[]; first: number | null };

function startReceiving(track: MediaStreamTrack, kind: Kind, key: CryptoKey): Receiver {
  const r: Receiver = { packets: 0, decrypted: 0, failed: 0, bad: [], counters: new Set(), latencies: [], first: null };
  track.onReceiveRtp.subscribe(async (rtp) => {
    const arrived = performance.timeOrigin + performance.now();
    r.packets += 1;
    const frame = kind === "video" ? stripVp8Descriptor(rtp.payload) : rtp.payload;
    const sealed = Uint8Array.from(frame);
    const plain = await decryptFrame((epoch) => (epoch === 0 ? key : undefined), sealed.buffer, headerLengthOf(kind, sealed));
    if (!plain) {
      r.failed += 1;
      return;
    }
    r.decrypted += 1;
    const parsed = parseBody(kind, new Uint8Array(plain));
    if (!parsed.ok) {
      if (r.bad.length < 5) r.bad.push(parsed.reason);
      return;
    }
    r.first ??= parsed.counter;
    r.counters.add(parsed.counter);
    r.latencies.push(arrived - parsed.sentAt);
  });
  return r;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

type Ctx = {
  tokenA: string;
  tokenB: string;
  sockA?: RoomSocket;
  sockB?: RoomSocket;
  pcA?: RTCPeerConnection;
  pcB?: RTCPeerConnection;
  sessionA?: string;
  sessionB?: string;
  pushed?: Record<Kind, RTCRtpTransceiver>;
  pulled?: RTCRtpTransceiver[];
  senders?: Record<Kind, Sender>;
};

async function joinRoom(ctx: Ctx) {
  ctx.sockA = await room.openSocket(ctx.tokenA);
  const welcomeA = await ctx.sockA.next(isWelcome, "A welcome");
  check("A room socket welcome (host, admitted)", welcomeA.self.admitted && welcomeA.self.isHost, `epoch ${welcomeA.epoch}`);
  ctx.sockB = await room.openSocket(ctx.tokenB);
  const welcomeB = await ctx.sockB.next(isWelcome, "B welcome");
  check("B room socket welcome (member, admitted)", welcomeB.self.admitted && !welcomeB.self.isHost, `${welcomeB.participants.length} participants`);
}

async function iceServers(token: string) {
  const reply = await proxy("/generate-ice-servers", token, "GET");
  const servers = Array.isArray(reply.body.iceServers) ? (reply.body.iceServers as Json[]) : [];
  const urls = servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls])) as string[];
  check("generate-ice-servers", isOk(reply.status) && servers.length > 0, `${describe(reply)}, ${urls.length} urls, turn: ${urls.some((u) => u.startsWith("turn"))}`);
  return servers;
}

async function newSession(token: string, who: string) {
  const reply = await proxy("/sessions/new", token, "POST");
  const ok = isOk(reply.status) && typeof reply.body.sessionId === "string";
  check(`${who} sessions/new`, ok, describe(reply));
  if (!ok) throw new Error(`${who} sessions/new failed: ${describe(reply)}`);
  return reply.body.sessionId as string;
}

async function publishA(ctx: Ctx, servers: Json[], key: CryptoKey) {
  ctx.sessionA = await newSession(ctx.tokenA, "A");
  const pc = (ctx.pcA = newPeer(servers));
  const pushed = {
    audio: pc.addTransceiver("audio", { direction: "sendonly" }),
    video: pc.addTransceiver("video", { direction: "sendonly" })
  };
  ctx.pushed = pushed;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const names = { audio: randomUUID(), video: randomUUID() };
  const reply = await proxy(`/sessions/${ctx.sessionA}/tracks/new`, ctx.tokenA, "POST", {
    sessionDescription: { sdp: offer.sdp, type: "offer" },
    tracks: (["audio", "video"] as const).map((kind) => ({ trackName: names[kind], mid: pushed[kind].mid, location: "local" }))
  });
  const ok = isOk(reply.status) && !reply.body.errorCode && reply.body.sessionDescription?.type === "answer";
  check("A tracks/new push (audio + video)", ok, describe(reply));
  if (!ok) throw new Error("push failed");
  await pc.setRemoteDescription(reply.body.sessionDescription);
  await waitConnected(pc, "A");
  check("A peer connection connected", true, await candidateTypes(pc));
  ctx.senders = startSending(pushed, key);

  // partytracks emits { ...trackData, sessionId, location: "remote" } without mid; use-publish adds mid: null.
  const wire = (kind: Kind): MeetingTrackMetadata => ({ location: "remote", sessionId: ctx.sessionA, trackName: names[kind], mid: null });
  ctx.sockA!.send({ t: "tracks", tracks: { audio: wire("audio"), video: wire("video") } satisfies MeetingTracks });
  ctx.sockA!.send({ t: "media", audioOn: true, videoOn: true, screenOn: false });
}

async function subscribeB(ctx: Ctx, servers: Json[], key: CryptoKey) {
  const announced = await ctx.sockB!.next(
    (m): m is Extract<MeetingServerMessage, { t: "participant" }> =>
      m.t === "participant" && m.participant.uid === "smoke-a" && Boolean(m.participant.tracks.audio && m.participant.tracks.video),
    "B sees A's tracks"
  );
  const tracks = announced.participant.tracks;
  check("B learns A's tracks from the room", tracks.audio?.sessionId === ctx.sessionA, `trackNames ${tracks.audio?.trackName?.slice(0, 8)}…, ${tracks.video?.trackName?.slice(0, 8)}…`);

  ctx.sessionB = await newSession(ctx.tokenB, "B");
  const pc = (ctx.pcB = newPeer(servers));
  const receivers: Partial<Record<Kind, Receiver>> = {};
  pc.onTrack.subscribe((track) => {
    const kind = track.kind as Kind;
    receivers[kind] ??= startReceiving(track, kind, key);
  });

  const reply = await proxy(`/sessions/${ctx.sessionB}/tracks/new`, ctx.tokenB, "POST", { tracks: [tracks.audio, tracks.video] });
  const trackErrors = ((reply.body.tracks ?? []) as Json[]).filter((t) => t.errorCode).map((t) => t.errorCode);
  const ok = isOk(reply.status) && !reply.body.errorCode && trackErrors.length === 0 && Boolean(reply.body.requiresImmediateRenegotiation);
  check("B tracks/new pull (requiresImmediateRenegotiation)", ok, `${describe(reply)}${trackErrors.length ? `, track errors ${trackErrors.join(",")}` : ""}`);
  if (!ok) throw new Error("pull failed");
  await pc.setRemoteDescription(reply.body.sessionDescription);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  const renegotiate = await proxy(`/sessions/${ctx.sessionB}/renegotiate`, ctx.tokenB, "PUT", {
    sessionDescription: { type: "answer", sdp: pc.localDescription?.sdp }
  });
  check("B renegotiate", isOk(renegotiate.status) && !renegotiate.body.errorCode, describe(renegotiate));
  ctx.pulled = pc.getTransceivers();
  await waitConnected(pc, "B");
  check("B peer connection connected", true, await candidateTypes(pc));
  return receivers;
}

async function measure(ctx: Ctx, receivers: Partial<Record<Kind, Receiver>>) {
  const firstPacket = timeout(
    (async () => {
      while (!receivers.audio?.first && !receivers.video?.first) await new Promise((r) => setTimeout(r, 50));
    })(),
    STEP_TIMEOUT_MS,
    "first decrypted packet at B"
  );
  await firstPacket.catch(() => undefined);
  info(`measuring for ${SECONDS}s…`);
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  ctx.senders!.audio.stop();
  ctx.senders!.video.stop();
  await new Promise((r) => setTimeout(r, 1500));

  for (const kind of ["audio", "video"] as const) {
    const r = receivers[kind];
    const sent = ctx.senders![kind].sent;
    if (!r || r.first === null) {
      check(`${kind}: packets received`, false, `0 received of ${sent} sent`);
      continue;
    }
    const expected = sent - r.first;
    const got = [...r.counters].filter((c) => c >= r.first!).length;
    const ratio = got / expected;
    check(`${kind}: packets received >= 80%`, ratio >= 0.8, `${got}/${expected} (${(ratio * 100).toFixed(1)}%), ${r.packets} RTP packets, first counter ${r.first}`);
    check(`${kind}: decrypt success 100%`, r.failed === 0 && r.decrypted === r.packets, `${r.decrypted}/${r.packets} decrypted, ${r.failed} failed`);
    check(`${kind}: payload integrity`, r.bad.length === 0, r.bad.length ? `bad: ${r.bad.join(", ")}` : `${r.counters.size} unique counters ok`);
    const [p50, p95, max] = [50, 95, 100].map((p) => percentile(r.latencies, p));
    check(`${kind}: one-way latency p95 < 1000 ms`, p95 < 1000, `p50 ${p50!.toFixed(1)} ms, p95 ${p95!.toFixed(1)} ms, max ${max!.toFixed(1)} ms`);
  }
}

async function negatives(ctx: Ctx) {
  const waiting = await ticket("smoke-c", "member", false);
  const notAdmitted = await proxy("/generate-ice-servers", waiting, "GET");
  check("neg: adm:false ticket on media proxy -> 403", notAdmitted.status === 403, describe(notAdmitted));
  const notAdmittedSession = await proxy("/sessions/new", waiting, "POST");
  check("neg: adm:false sessions/new -> 403", notAdmittedSession.status === 403, describe(notAdmittedSession));

  const badOrigin = await proxy("/generate-ice-servers", ctx.tokenA, "GET", undefined, "https://evil.example");
  check("neg: bad Origin on media proxy -> 403", badOrigin.status === 403, describe(badOrigin));
  const noOrigin = await proxy("/sessions/new", ctx.tokenA, "POST", undefined, null);
  check("neg: missing Origin on media proxy -> 403", noOrigin.status === 403, describe(noOrigin));
  const wsStatus = await room.openSocket(ctx.tokenA, "https://evil.example").then(
    (s) => (s.close(), 101),
    (error: { status?: number }) => error.status ?? 0
  );
  check("neg: bad Origin on room socket -> 403", wsStatus === 403, `HTTP ${wsStatus}`);

  const otherMeeting = await ticket("smoke-b", "member", true, `${MEETING_ID}x`);
  const wrongMid = await proxy("/generate-ice-servers", otherMeeting, "GET");
  check("neg: ticket for another meeting -> 401", wrongMid.status === 401, describe(wrongMid));

  const noSocket = await proxy("/sessions/new", await ticket("smoke-d", "member", true), "POST");
  check("neg: admitted ticket without room socket -> 403", noSocket.status === 403, describe(noSocket));

  const sdp = ctx.pcB!.localDescription!.sdp;
  const hijackPull = await proxy(`/sessions/${ctx.sessionA}/tracks/new`, ctx.tokenB, "POST", {
    tracks: [{ location: "remote", sessionId: ctx.sessionB, trackName: "x" }]
  });
  check("neg: B uses A's session (tracks/new) -> 403", hijackPull.status === 403, describe(hijackPull));
  const hijackRenegotiate = await proxy(`/sessions/${ctx.sessionA}/renegotiate`, ctx.tokenB, "PUT", { sessionDescription: { type: "answer", sdp } });
  check("neg: B uses A's session (renegotiate) -> 403", hijackRenegotiate.status === 403, describe(hijackRenegotiate));
  const hijackClose = await proxy(`/sessions/${ctx.sessionA}/tracks/close`, ctx.tokenB, "PUT", {
    tracks: [{ mid: "0" }],
    sessionDescription: { type: "offer", sdp },
    force: true
  });
  check("neg: B closes A's tracks -> 403", hijackClose.status === 403, describe(hijackClose));
  const foreignPull = await proxy(`/sessions/${ctx.sessionB}/tracks/new`, ctx.tokenB, "POST", {
    tracks: [{ location: "remote", sessionId: "notinthismeeting0000", trackName: "x" }]
  });
  check("neg: pull from a session outside the meeting -> 403", foreignPull.status === 403, describe(foreignPull));

  const claim = ctx.sockB!.next((m): m is Extract<MeetingServerMessage, { t: "error" }> => m.t === "error", "room error for a claimed session");
  ctx.sockB!.send({ t: "tracks", tracks: { audio: { location: "remote", sessionId: ctx.sessionA, trackName: "x", mid: null } } });
  const claimError = await claim.catch(() => null);
  check("neg: B announces A's session in the room -> error", Boolean(claimError), claimError?.message ?? "no error message");
}

async function cleanup(ctx: Ctx) {
  ctx.senders?.audio.stop();
  ctx.senders?.video.stop();
  if (ctx.pcB && ctx.sessionB && ctx.pulled?.length && ctx.pcB.connectionState === "connected") {
    const reply = await closeTracks(ctx.pcB, ctx.sessionB, ctx.tokenB, ctx.pulled).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
    check("cleanup: B tracks/close", isOk(reply.status), describe(reply));
  }
  if (ctx.pcA && ctx.sessionA && ctx.pushed && ctx.pcA.connectionState === "connected") {
    const reply = await closeTracks(ctx.pcA, ctx.sessionA, ctx.tokenA, [ctx.pushed.audio, ctx.pushed.video]).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
    check("cleanup: A tracks/close", isOk(reply.status), describe(reply));
  }
  await Promise.allSettled([ctx.pcA?.close(), ctx.pcB?.close()]);
  ctx.sockA?.close();
  ctx.sockB?.close();

  const ended = await room.end();
  check("cleanup: end the smoke room", isOk(ended), String(ended));
}

async function main() {
  requireSecret();
  console.log(`Meetings smoke: ${ROOM_URL}, meeting ${MEETING_ID}, Origin ${ORIGIN}\n`);
  const ctx: Ctx = { tokenA: await ticket("smoke-a", "host", true), tokenB: await ticket("smoke-b", "member", true) };
  const key = await deriveMeetingKey(new Uint8Array(randomBytes(32)), "frame");
  try {
    await joinRoom(ctx);
    const servers = await iceServers(ctx.tokenA);
    await publishA(ctx, servers, key);
    const receivers = await subscribeB(ctx, servers, key);
    await measure(ctx, receivers);
    await negatives(ctx);
  } catch (error) {
    check("flow completed", false, error instanceof Error ? error.message : String(error));
  } finally {
    await timeout(cleanup(ctx), STEP_TIMEOUT_MS, "cleanup").catch((error: Error) => check("cleanup", false, error.message));
  }
  finish();
}

void main();
