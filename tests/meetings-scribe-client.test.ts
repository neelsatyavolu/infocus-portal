import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ driveFetch: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@/src/lib/nas-storage", () => ({ driveFetch: mocks.driveFetch }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { meeting: { findUnique: mocks.findUnique, update: mocks.update } } }));
vi.mock("@/src/server/meetings-keys", () => ({
  readMeetingKey: (row: { keyCiphertext: string | null; keyEpoch: number }) => (row.keyCiphertext ? { key: `key-${row.keyEpoch}`, epoch: row.keyEpoch } : null)
}));

import { verifyMeetingRoomToken } from "@/src/lib/meetings/room-token";
import { fetchMeetingTranscript, rekeyMeetingScribe, startMeetingScribe } from "@/src/server/meetings-scribe";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-05T05:00:00.000Z");
const ok = () => new Response("{}", { status: 200 });

function bodyOf(call: unknown[]) {
  return JSON.parse(String((call[1] as RequestInit).body));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MEETING_ROOM_SECRET", SECRET);
  vi.stubEnv("MEETING_ROOM_URL", "https://meet-room.example.edu");
  vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
  mocks.findUnique.mockResolvedValue({ roomGeneration: 3, keyCiphertext: "c", keyEpoch: 7 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Scribe re-ticket (POST /api/service/meetings/scribe/rekey)", () => {
  it("sends the newest key and a fresh 4 h scribe ticket for the current generation", async () => {
    mocks.driveFetch.mockResolvedValue(ok());
    expect(await rekeyMeetingScribe("m1", { key: "old", epoch: 6 })).toBe(true);
    const [path, init] = mocks.driveFetch.mock.calls[0]!;
    expect(path).toBe("/api/service/meetings/scribe/rekey");
    const body = bodyOf([path, init]);
    expect(Object.keys(body).sort()).toEqual(["epoch", "key", "meetingId", "roomToken", "roomUrl", "ticketExpiresAt"]);
    expect(body).toMatchObject({ meetingId: "m1", key: "key-7", epoch: 7, roomUrl: "https://meet-room.example.edu" });
    const ticket = await verifyMeetingRoomToken(body.roomToken, SECRET);
    expect(ticket).toMatchObject({ mid: "m1", uid: "scribe", role: "scribe", adm: true, gen: 3 });
    expect(new Date(body.ticketExpiresAt).getTime()).toBe(ticket!.exp);
  });

  it("retries twice more (5 s, then 20 s), including on 404 while the Scribe starts", async () => {
    vi.useFakeTimers();
    mocks.driveFetch
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(ok());
    expect(await rekeyMeetingScribe("m1")).toBe(false);
    expect(mocks.driveFetch).toHaveBeenCalledTimes(1);
    // Signing the ticket is real WebCrypto (not a timer), so wait for each try to land.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(mocks.driveFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(mocks.driveFetch).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(mocks.driveFetch).toHaveBeenCalledTimes(3));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.driveFetch).toHaveBeenCalledTimes(3);
  });
});

describe("Scribe start", () => {
  it("numbers the part and records when it started", async () => {
    mocks.update.mockResolvedValue({ notesPart: 2 });
    mocks.driveFetch.mockResolvedValue(ok());
    await startMeetingScribe({ id: "m1", title: "Rundown", startsAt: NOW }, { key: "k", epoch: 1 }, NOW);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { notesPart: { increment: 1 }, scribeStartedAt: NOW }, select: { notesPart: true } });
    expect(bodyOf(mocks.driveFetch.mock.calls[0]!)).toMatchObject({ meetingId: "m1", part: 2, key: "k", epoch: 1 });
  });
});

describe("transcripts in parts", () => {
  it("fetches once: the Drive already joins every part in order (per-part fetches repeated the meeting)", async () => {
    mocks.driveFetch.mockResolvedValue(new Response("one\n---\n\ntwo", { status: 200 }));
    expect(await fetchMeetingTranscript("m1")).toBe("one\n---\n\ntwo");
    expect(mocks.driveFetch.mock.calls.map((call) => call[0])).toEqual(["/api/service/meetings/m1/transcript"]);
  });

  it("is null when the Drive has no transcript", async () => {
    mocks.driveFetch.mockResolvedValue(new Response("", { status: 404 }));
    expect(await fetchMeetingTranscript("m1")).toBeNull();
  });
});
