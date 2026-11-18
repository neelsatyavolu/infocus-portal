import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(),
  findUnique: vi.fn(), update: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...await original<typeof import("@/src/lib/platform-admin")>(), getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { packageProgressRow: { findUnique: mocks.findUnique, update: mocks.update } } }));
vi.mock("@/src/server/show-schedule", () => ({ listUpcomingShowDays: vi.fn() }));
import { PUT } from "@/app/api/package-cycle/queue/[rowId]/toss/route";

const save = (toss: unknown, rowId = "row-1") => PUT(
  new Request(`https://infocus.test/api/package-cycle/queue/${rowId}/toss`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toss })
  }),
  { params: Promise.resolve({ rowId }) }
);

const CUSTOM_ROW = { cycleNumber: 0, groupType: "CUSTOM_QUEUE", queuedForAirAt: new Date("2026-11-18T12:00:00Z") };

describe("toss on a custom publishing-queue package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user");
    mocks.syncUserProfile.mockResolvedValue({ id: "user", email: "user@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.findUnique.mockResolvedValue(CUSTOM_ROW);
    mocks.update.mockImplementation(({ data }: { data: { finalCutToss: string } }) => Promise.resolve(data));
  });

  it("saves a cleaned-up toss", async () => {
    const response = await save("  InFocus reporters   Abby and Otto went there.  ");
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "row-1" }, data: { finalCutToss: "InFocus reporters Abby and Otto went there." }
    }));
    expect((await response.json()).data).toEqual({ toss: "InFocus reporters Abby and Otto went there." });
  });

  it("clears the toss when it is blank", async () => {
    const response = await save("   ");
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { finalCutToss: "" } }));
  });

  it("rejects teleprompter cue characters and overlong tosses", async () => {
    expect((await save("Hold {HOLD}")).status).toBe(400);
    expect((await save("a".repeat(501))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("only edits custom packages; roster packages keep their toss on the Final Cut tab", async () => {
    mocks.findUnique.mockResolvedValue({ ...CUSTOM_ROW, cycleNumber: 3, groupType: "PACKAGE" });
    expect((await save("A toss.")).status).toBeGreaterThanOrEqual(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("is for producers only", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    expect((await save("A toss.")).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
