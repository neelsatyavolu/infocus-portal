import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingServerMessage } from "@/src/lib/meetings/protocol";
import { PROBE_TIMEOUT_MS, RoomSocket, backoffDelay, roomSocketUrl } from "@/src/lib/meetings/client/room-socket";

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
  let tokens: Array<string | null>;
  let room: RoomSocket;

  const make = (extra: Partial<ConstructorParameters<typeof RoomSocket>[0]> = {}) =>
    new RoomSocket({
      roomUrl: "https://room.example.edu/",
      meetingId: "m1",
      getToken: () => tokens.shift() ?? "a.b",
      onMessage: (m) => messages.push(m),
      createSocket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      ...extra
    });

  /** Lets the async getToken() resolve. */
  const settle = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    sockets = [];
    messages = [];
    tokens = [];
    room = make();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds the ws url", () => {
    expect(roomSocketUrl("https://room.example.edu/", "m 1", "a+b")).toBe("wss://room.example.edu/rooms/m%201/ws?token=a%2Bb");
  });

  it("pings with exactly {t:'ping'} and reconnects after a drop", async () => {
    room.connect();
    await settle();
    sockets[0].open();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sockets[0].sent).toEqual(['{"t":"ping"}']);
    sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  it("asks for a (possibly refreshed) ticket on every (re)connect", async () => {
    tokens = ["first.t", "second.t"];
    room.connect();
    await settle();
    sockets[0].open();
    sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets.map((s) => new URL(s.url).searchParams.get("token"))).toEqual(["first.t", "second.t"]);
  });

  it("stops when there's no ticket (the call is over)", async () => {
    const statuses: string[] = [];
    const ended = make({ getToken: async () => null, onStatus: (s) => statuses.push(s) });
    ended.connect();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets).toHaveLength(0);
    expect(statuses.at(-1)).toBe("closed");
  });

  it("treats close code 4003 as removed and stops reconnecting", async () => {
    room.connect();
    await settle();
    sockets[0].open();
    sockets[0].close(4003);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(messages).toEqual([{ t: "removed" }]);
    expect(sockets).toHaveLength(1);
  });

  it("reports a full room (4029) without reconnecting", async () => {
    const reasons: string[] = [];
    const full = make({ onFinalClose: (reason) => reasons.push(reason) });
    full.connect();
    await settle();
    sockets[0].close(4029);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reasons).toEqual(["full"]);
    expect(sockets).toHaveLength(1);
  });

  it("does not reconnect after an ended message", async () => {
    room.connect();
    await settle();
    sockets[0].open();
    sockets[0].receive({ t: "ended" });
    sockets[0].close(4010);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(messages).toEqual([{ t: "ended" }]);
    expect(sockets).toHaveLength(1);
  });

  it("probe: a pong in time keeps the socket", async () => {
    room.connect();
    await settle();
    sockets[0].open();
    room.probe();
    expect(sockets[0].sent).toEqual(['{"t":"ping"}']);
    sockets[0].receive({ t: "pong" });
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 100);
    expect(sockets).toHaveLength(1);
  });

  it("probe: no answer in 5 s reopens at once with the backoff reset", async () => {
    room.connect();
    await settle();
    sockets[0].open();
    // Build up backoff first.
    sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1].open();
    room.probe();
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    expect(sockets).toHaveLength(3);
    expect(sockets[1].readyState).toBe(3);
  });

  it("backs off up to 10 s", () => {
    expect(backoffDelay(0)).toBeLessThanOrEqual(500);
    expect(backoffDelay(20)).toBeLessThanOrEqual(10_000);
    expect(backoffDelay(20)).toBeGreaterThanOrEqual(5_000);
  });
});
