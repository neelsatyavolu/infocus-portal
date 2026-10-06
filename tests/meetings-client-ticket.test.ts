import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingApiError } from "@/src/lib/meetings/client/api";
import { toBase64Url } from "@/src/lib/meetings/client/frame-crypto";
import { KeyCatchUp } from "@/src/lib/meetings/client/key-catchup";
import {
  RECONNECT_MIN_LEFT_MS,
  TicketManager,
  decodeTicket,
  fatalFromError,
  needsRefreshBeforeConnect,
  refreshAt
} from "@/src/lib/meetings/client/ticket";

const HOUR = 3600_000;
const ticketFor = (iat: number, exp: number) =>
  `${toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, kind: "room", iat, exp })))}.sig`;

describe("ticket helpers", () => {
  it("decodes iat/exp and refreshes at 75%", () => {
    const token = ticketFor(0, 4 * HOUR);
    expect(decodeTicket(token)).toEqual({ iat: 0, exp: 4 * HOUR });
    expect(refreshAt({ iat: 0, exp: 4 * HOUR })).toBe(3 * HOUR);
    expect(decodeTicket("garbage")).toBeNull();
  });

  it("refreshes before a reconnect with under 10 minutes left (or an unreadable ticket)", () => {
    const token = ticketFor(0, 4 * HOUR);
    expect(needsRefreshBeforeConnect(token, 4 * HOUR - RECONNECT_MIN_LEFT_MS - 1)).toBe(false);
    expect(needsRefreshBeforeConnect(token, 4 * HOUR - RECONNECT_MIN_LEFT_MS + 1)).toBe(true);
    expect(needsRefreshBeforeConnect("garbage", 0)).toBe(true);
  });

  it("maps /ticket errors: 410 ended, 403 removed, 401 sign in", () => {
    expect(fatalFromError(new MeetingApiError("x", 410))).toBe("ended");
    expect(fatalFromError(new MeetingApiError("x", 403))).toBe("removed");
    expect(fatalFromError(new MeetingApiError("x", 401))).toBe("signin");
    expect(fatalFromError(new MeetingApiError("x", 503))).toBeNull();
    expect(fatalFromError(new Error("offline"))).toBeNull();
  });
});

describe("TicketManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  const deps = (overrides: Partial<ConstructorParameters<typeof TicketManager>[1]> = {}) => ({
    fetchTicket: vi.fn(async () => ({ roomToken: ticketFor(Date.now(), Date.now() + 4 * HOUR), roomUrl: "https://room.example.edu", key: { key: "k", epoch: 2 } })),
    onKey: vi.fn(),
    onFatal: vi.fn(),
    ...overrides
  });

  it("puts the ticket in a live Authorization header and refreshes it in place at 75%", async () => {
    const d = deps();
    const manager = new TicketManager({ roomToken: ticketFor(0, 4 * HOUR), roomUrl: "https://room.example.edu" }, d);
    const headers = manager.headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${ticketFor(0, 4 * HOUR)}`);
    await vi.advanceTimersByTimeAsync(3 * HOUR - 1000);
    expect(d.fetchTicket).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.fetchTicket).toHaveBeenCalledTimes(1);
    expect(manager.headers).toBe(headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${manager.current}`);
    expect(decodeTicket(manager.current)?.exp).toBe(3 * HOUR + 4 * HOUR);
    expect(d.onKey).toHaveBeenCalledWith({ key: "k", epoch: 2 });
    manager.stop();
  });

  it("refreshes before a reconnect when the ticket is nearly expired, single-flight", async () => {
    const d = deps();
    const manager = new TicketManager({ roomToken: ticketFor(0, 5 * 60_000), roomUrl: "r" }, d);
    const [a, b] = await Promise.all([manager.forConnect(), manager.forConnect()]);
    expect(d.fetchTicket).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a).toBe(manager.current);
    manager.stop();
  });

  it("ends the call on 410/403/401 and returns no ticket", async () => {
    for (const [status, kind] of [
      [410, "ended"],
      [403, "removed"],
      [401, "signin"]
    ] as const) {
      const d = deps({ fetchTicket: vi.fn(async () => Promise.reject(new MeetingApiError("no", status))) });
      const manager = new TicketManager({ roomToken: ticketFor(0, 60_000), roomUrl: "r" }, d);
      expect(await manager.forConnect()).toBeNull();
      expect(d.onFatal).toHaveBeenCalledWith(kind);
      expect(await manager.forConnect()).toBeNull();
    }
  });

  it("keeps the current ticket on a transient failure and retries", async () => {
    const fetchTicket = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ roomToken: ticketFor(0, 8 * HOUR), roomUrl: "r", key: { key: "k", epoch: 0 } });
    const d = deps({ fetchTicket });
    const original = ticketFor(0, 60_000);
    const manager = new TicketManager({ roomToken: original, roomUrl: "r" }, d);
    expect(await manager.refresh()).toBe(original);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchTicket).toHaveBeenCalledTimes(2);
    expect(manager.current).toBe(ticketFor(0, 8 * HOUR));
    manager.stop();
  });

  it("never refreshes a lobby (waiting) ticket", async () => {
    const d = deps({ refreshable: false });
    const token = ticketFor(0, 60_000);
    const manager = new TicketManager({ roomToken: token, roomUrl: "r" }, d);
    expect(await manager.forConnect()).toBe(token);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(d.fetchTicket).not.toHaveBeenCalled();
  });
});

describe("KeyCatchUp", () => {
  const setup = (responses: Array<{ key: string; epoch: number } | Error>) => {
    let epoch = 0;
    const fetchKey = vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("no more");
      if (next instanceof Error) throw next;
      return next;
    });
    const setKey = vi.fn(async (key: { epoch: number }) => {
      epoch = Math.max(epoch, key.epoch);
    });
    const onFatal = vi.fn();
    const catchUp = new KeyCatchUp({ fetchKey, setKey, currentEpoch: () => epoch, onFatal, sleep: async () => undefined });
    return { catchUp, fetchKey, setKey, onFatal, epoch: () => epoch };
  };

  it("does nothing when we already have the room's epoch", async () => {
    const t = setup([]);
    await t.catchUp.ensure(0, { rekey: false });
    expect(t.fetchKey).not.toHaveBeenCalled();
  });

  it("fetches with backoff until the key ring catches up (the Portal can lag the room)", async () => {
    const t = setup([new Error("offline"), { key: "k0", epoch: 0 }, { key: "k1", epoch: 1 }]);
    await t.catchUp.ensure(1, { rekey: true });
    expect(t.fetchKey).toHaveBeenCalledTimes(3);
    expect(t.setKey).toHaveBeenCalledWith({ key: "k1", epoch: 1 }, { rekey: true });
    expect(t.epoch()).toBe(1);
  });

  it("ends the call on 401/403/410 instead of failing silently", async () => {
    const t = setup([new MeetingApiError("expired", 401)]);
    await t.catchUp.ensure(3, { rekey: true });
    expect(t.onFatal).toHaveBeenCalledWith("signin");
    expect(t.epoch()).toBe(0);
  });

  it("keeps retrying past a long outage instead of leaving voices undecryptable", async () => {
    const outage = Array.from({ length: 20 }, () => new Error("offline"));
    const t = setup([...outage, { key: "k1", epoch: 1 }]);
    await t.catchUp.ensure(1, { rekey: true });
    expect(t.fetchKey).toHaveBeenCalledTimes(21);
    expect(t.epoch()).toBe(1);
  });

  it("stops retrying once stopped (the call ended)", async () => {
    let epoch = 0;
    let calls = 0;
    const catchUp: KeyCatchUp = new KeyCatchUp({
      fetchKey: async () => {
        calls += 1;
        if (calls === 3) catchUp.stop();
        throw new Error("offline");
      },
      setKey: async (key) => {
        epoch = key.epoch;
      },
      currentEpoch: () => epoch,
      onFatal: () => undefined,
      sleep: async () => undefined
    });
    await catchUp.ensure(1, { rekey: true });
    expect(calls).toBe(3);
  });

  it("joins a run already in progress", async () => {
    const t = setup([{ key: "k2", epoch: 2 }]);
    await Promise.all([t.catchUp.ensure(1, { rekey: true }), t.catchUp.ensure(2, { rekey: true })]);
    expect(t.fetchKey).toHaveBeenCalledTimes(1);
    expect(t.epoch()).toBe(2);
  });
});
