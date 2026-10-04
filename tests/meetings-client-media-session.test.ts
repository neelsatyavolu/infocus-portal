import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";

let transceivers = new Subject<RTCRtpTransceiver>();

vi.mock("partytracks/client", () => ({
  PartyTracks: class {
    transceiver$ = transceivers.asObservable();
  }
}));

import { CLOSE_GUARD_MS, createMediaSession } from "@/src/lib/meetings/client/media-session";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";

function fakeTransceiver() {
  return {
    stop: vi.fn(),
    sender: { replaceTrack: vi.fn(() => Promise.resolve()) }
  };
}

function session(attach: (t: RTCRtpTransceiver) => void) {
  return createMediaSession({
    roomUrl: "https://room.example.edu",
    meetingId: "m1",
    token: "t",
    e2ee: { attach } as unknown as MeetingE2ee
  });
}

describe("createMediaSession", () => {
  beforeEach(() => {
    transceivers = new Subject<RTCRtpTransceiver>();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
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

  it("stops a transceiver whose transform can't be attached", async () => {
    const onError = vi.fn();
    await createMediaSession({
      roomUrl: "https://room.example.edu",
      meetingId: "m1",
      token: "t",
      e2ee: { attach: () => { throw new Error("no transform"); } } as unknown as MeetingE2ee,
      onError
    });
    const t = fakeTransceiver();
    transceivers.next(t as unknown as RTCRtpTransceiver);
    expect(t.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(t.stop).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it("on close stops existing transceivers and keeps stopping late ones until the guard ends", async () => {
    const attach = vi.fn();
    const media = await session(attach);
    const early = fakeTransceiver();
    transceivers.next(early as unknown as RTCRtpTransceiver);
    media.close();
    expect(early.stop).toHaveBeenCalled();

    const late = fakeTransceiver();
    transceivers.next(late as unknown as RTCRtpTransceiver);
    expect(late.stop).toHaveBeenCalled();
    expect(attach).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CLOSE_GUARD_MS);
    const after = fakeTransceiver();
    transceivers.next(after as unknown as RTCRtpTransceiver);
    expect(after.stop).not.toHaveBeenCalled();
  });
});
