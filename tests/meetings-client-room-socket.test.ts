import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingServerMessage } from "@/src/lib/meetings/protocol";
import { RoomSocket, backoffDelay, roomSocketUrl } from "@/src/lib/meetings/client/room-socket";

class FakeSocket {
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("RoomSocket", () => {
  let sockets: FakeSocket[];
  let messages: MeetingServerMessage[];
  let room: RoomSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    sockets = [];
    messages = [];
    room = new RoomSocket({
      roomUrl: "https://room.example.edu/",
      meetingId: "m1",
      token: "a.b",
      onMessage: (m) => messages.push(m),
      createSocket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds the ws url", () => {
    expect(roomSocketUrl("https://room.example.edu/", "m 1", "a+b")).toBe("wss://room.example.edu/rooms/m%201/ws?token=a%2Bb");
  });

  it("pings with exactly {t:'ping'} and reconnects after a drop", () => {
    room.connect();
    sockets[0].open();
    vi.advanceTimersByTime(20_000);
    expect(sockets[0].sent).toEqual(['{"t":"ping"}']);
    sockets[0].close(1006);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
  });

  it("treats close code 4003 as removed and stops reconnecting", () => {
    room.connect();
    sockets[0].open();
    sockets[0].close(4003);
    vi.advanceTimersByTime(30_000);
    expect(messages).toEqual([{ t: "removed" }]);
    expect(sockets).toHaveLength(1);
  });

  it("reports a full room (4029) without reconnecting", () => {
    const reasons: string[] = [];
    const full = new RoomSocket({
      roomUrl: "https://room.example.edu",
      meetingId: "m1",
      token: "t",
      onMessage: () => undefined,
      onFinalClose: (reason) => reasons.push(reason),
      createSocket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      }
    });
    full.connect();
    sockets[0].close(4029);
    vi.advanceTimersByTime(30_000);
    expect(reasons).toEqual(["full"]);
    expect(sockets).toHaveLength(1);
  });

  it("does not reconnect after an ended message", () => {
    room.connect();
    sockets[0].open();
    sockets[0].receive({ t: "ended" });
    sockets[0].close(4010);
    vi.advanceTimersByTime(30_000);
    expect(messages).toEqual([{ t: "ended" }]);
    expect(sockets).toHaveLength(1);
  });

  it("backs off up to 10 s", () => {
    expect(backoffDelay(0)).toBeLessThanOrEqual(500);
    expect(backoffDelay(20)).toBeLessThanOrEqual(10_000);
    expect(backoffDelay(20)).toBeGreaterThanOrEqual(5_000);
  });
});
