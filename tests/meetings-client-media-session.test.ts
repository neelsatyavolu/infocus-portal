import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";

let transceivers = new Subject<RTCRtpTransceiver>();
let sessions = new Subject<{ peerConnection: RTCPeerConnection; sessionId: string | undefined }>();
let constructed: Array<Record<string, unknown>> = [];

vi.mock("partytracks/client", () => ({
  PartyTracks: class {
    transceiver$ = transceivers.asObservable();
    session$ = sessions.asObservable();
    constructor(config: Record<string, unknown>) {
      constructed.push(config);
    }
  }
}));

import { CLOSE_GUARD_MS, ZOMBIE_AFTER_MS, createMediaSession, fetchIceServers } from "@/src/lib/meetings/client/media-session";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";

function fakeTransceiver() {
  return {
    stop: vi.fn(),
    sender: { replaceTrack: vi.fn(() => Promise.resolve()) }
  };
}

class FakePc extends EventTarget {
  connectionState: RTCPeerConnectionState = "new";
  transceivers: ReturnType<typeof fakeTransceiver>[] = [];
  getTransceivers() {
    return this.transceivers;
  }
  set(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.dispatchEvent(new Event("connectionstatechange"));
  }
}

const e2ee = (attach: (t: RTCRtpTransceiver) => void = vi.fn()) => ({ attach, forget: vi.fn() }) as unknown as MeetingE2ee;

function session(attach: (t: RTCRtpTransceiver) => void, extra: Record<string, unknown> = {}) {
  return createMediaSession({
    roomUrl: "https://room.example.edu",
    meetingId: "m1",
    ticket: { current: "t" },
    e2ee: e2ee(attach),
    ...extra
  });
}

describe("createMediaSession", () => {
  beforeEach(() => {
    transceivers = new Subject<RTCRtpTransceiver>();
    sessions = new Subject();
    constructed = [];
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ iceServers: [{ urls: "turn:turn.example.edu" }] })))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("attaches E2EE to every transceiver", async () => {
    const attach = vi.fn();
    await session(attach);
    const t = fakeTransceiver();
    transceivers.next(t as unknown as RTCRtpTransceiver);
    expect(attach).toHaveBeenCalledWith(t);
    expect(t.stop).not.toHaveBeenCalled();
  });

  it("passes the live Authorization headers to PartyTracks and keeps the query token", async () => {
    const headers = new Headers({ Authorization: "Bearer t" });
    await session(vi.fn(), { ticket: { current: "t", headers } });
    expect(constructed[0].headers).toBe(headers);
    expect(constructed[0].apiExtraParams).toBe("token=t");
  });

  it("stops a transceiver whose transform can't be attached", async () => {
    const onError = vi.fn();
    await session(
      () => {
        throw new Error("no transform");
      },
      { onError }
    );
    const t = fakeTransceiver();
    transceivers.next(t as unknown as RTCRtpTransceiver);
    expect(t.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(t.stop).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it("on close stops the peer connection's transceivers and keeps stopping late ones until the guard ends", async () => {
    const attach = vi.fn();
    const media = await session(attach);
    const pc = new FakePc();
    const early = fakeTransceiver();
    pc.transceivers.push(early);
    sessions.next({ peerConnection: pc as unknown as RTCPeerConnection, sessionId: "s1" });
    media.close();
    expect(early.stop).toHaveBeenCalled();

    const late = fakeTransceiver();
    transceivers.next(late as unknown as RTCRtpTransceiver);
    expect(late.stop).toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();

    vi.advanceTimersByTime(CLOSE_GUARD_MS);
    const after = fakeTransceiver();
    transceivers.next(after as unknown as RTCRtpTransceiver);
    expect(after.stop).not.toHaveBeenCalled();
  });

  it("reports a zombie when sessions/new failed (no session id)", async () => {
    const onZombie = vi.fn();
    await session(vi.fn(), { onZombie });
    sessions.next({ peerConnection: new FakePc() as unknown as RTCPeerConnection, sessionId: undefined });
    expect(onZombie).toHaveBeenCalledWith("no_session_id");
  });

  it("reports a zombie when the peer connection stays unconnected for 15 s, once", async () => {
    const onZombie = vi.fn();
    await session(vi.fn(), { onZombie });
    const pc = new FakePc();
    sessions.next({ peerConnection: pc as unknown as RTCPeerConnection, sessionId: "s1" });
    pc.set("connecting");
    vi.advanceTimersByTime(ZOMBIE_AFTER_MS - 1);
    expect(onZombie).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onZombie).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ZOMBIE_AFTER_MS * 3);
    expect(onZombie).toHaveBeenCalledTimes(1);
  });

  it("is happy once connected (and tolerates a short blip)", async () => {
    const onZombie = vi.fn();
    await session(vi.fn(), { onZombie });
    const pc = new FakePc();
    sessions.next({ peerConnection: pc as unknown as RTCPeerConnection, sessionId: "s1" });
    pc.set("connected");
    vi.advanceTimersByTime(ZOMBIE_AFTER_MS * 2);
    pc.set("disconnected");
    vi.advanceTimersByTime(ZOMBIE_AFTER_MS / 2);
    pc.set("connected");
    vi.advanceTimersByTime(ZOMBIE_AFTER_MS * 2);
    expect(onZombie).not.toHaveBeenCalled();
  });
});

describe("fetchIceServers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries 3 times, then falls back (logged) instead of failing silently", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchIceServers("https://room.example.edu/p", { current: "t" }, async () => undefined);
    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends the ticket as Authorization and in the query", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ iceServers: [{ urls: "turn:x" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const headers = new Headers({ Authorization: "Bearer t" });
    expect(await fetchIceServers("https://room.example.edu/p", { current: "t", headers })).toEqual([{ urls: "turn:x" }]);
    expect(fetchMock).toHaveBeenCalledWith("https://room.example.edu/p/generate-ice-servers?token=t", { headers });
  });
});
