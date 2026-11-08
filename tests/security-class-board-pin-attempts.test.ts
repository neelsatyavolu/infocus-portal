import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLASS_BOARD_PIN_MAX_FAILURES, encryptClassBoardPin } from "@/src/lib/class-board-pin";

const SECRET = "test-secret";

type Settings = {
  id: string;
  cyclesPerSemester: number;
  classBoardPinCipher: string;
  classBoardPinFailures: number;
  classBoardPinFailureAt: Date | null;
};

const m = vi.hoisted(() => ({ row: null as Settings | null }));

// A one-row settings table whose updateMany is conditional, like the database's.
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    programSetting: {
      findUnique: vi.fn(async () => (m.row ? { ...m.row } : null)),
      upsert: vi.fn(async () => ({ ...m.row })),
      update: vi.fn(),
      updateMany: vi.fn(
        async ({
          where,
          data
        }: {
          where: { classBoardPinFailures?: { lt?: number; gt?: number }; classBoardPinFailureAt?: Date | null };
          data: { classBoardPinFailures?: number | { increment?: number; decrement?: number }; classBoardPinFailureAt?: Date };
        }) => {
          // Let overlapping callers interleave before the write.
          await Promise.resolve();
          const row = m.row as Settings;
          const failures = where.classBoardPinFailures;
          if (failures?.lt !== undefined && !(row.classBoardPinFailures < failures.lt)) return { count: 0 };
          if (failures?.gt !== undefined && !(row.classBoardPinFailures > failures.gt)) return { count: 0 };
          if ("classBoardPinFailureAt" in where && where.classBoardPinFailureAt?.getTime() !== row.classBoardPinFailureAt?.getTime()) {
            return { count: 0 };
          }
          const change = data.classBoardPinFailures;
          const next =
            typeof change === "number"
              ? change
              : row.classBoardPinFailures + (change?.increment ?? 0) - (change?.decrement ?? 0);
          m.row = {
            ...row,
            classBoardPinFailures: next,
            ...(data.classBoardPinFailureAt ? { classBoardPinFailureAt: data.classBoardPinFailureAt } : {})
          };
          return { count: 1 };
        }
      )
    }
  }
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: vi.fn(), set: vi.fn() }) }));
vi.mock("@/src/lib/auth", () => ({ getRealSessionUser: vi.fn() }));

import { prisma } from "@/src/lib/prisma";
import { unlockClassBoard } from "@/src/server/class-board-pin";

const NOW = new Date("2026-11-07T18:00:00.000Z");

describe("class board PIN attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_AUTH_SECRET = SECRET;
    m.row = {
      id: "singleton",
      cyclesPerSemester: 3,
      classBoardPinCipher: encryptClassBoardPin("482193", SECRET),
      classBoardPinFailures: 0,
      classBoardPinFailureAt: null
    };
  });

  it("evaluates at most the window's attempts, however many guesses arrive at once", async () => {
    const guesses = Array.from({ length: 60 }, (_, index) => String(100000 + index));
    const results = await Promise.allSettled(guesses.map((pin) => unlockClassBoard(pin, NOW)));
    const reasons = results.map((result) => (result.status === "rejected" ? (result.reason as Error).message : "OK"));

    expect(reasons.filter((reason) => reason === "FORBIDDEN")).toHaveLength(CLASS_BOARD_PIN_MAX_FAILURES);
    expect(reasons.filter((reason) => reason === "TOO_MANY_REQUESTS")).toHaveLength(60 - CLASS_BOARD_PIN_MAX_FAILURES);
    expect(m.row?.classBoardPinFailures).toBe(CLASS_BOARD_PIN_MAX_FAILURES);

    // Locked out: even the right PIN is refused until the window passes.
    await expect(unlockClassBoard("482193", NOW)).rejects.toThrow("TOO_MANY_REQUESTS");
    const later = new Date(NOW.getTime() + 16 * 60 * 1000);
    await expect(unlockClassBoard("482193", later)).resolves.toEqual(expect.any(String));
  });

  it("reserves the attempt before comparing and gives it back for the right PIN", async () => {
    await expect(unlockClassBoard("482193", NOW)).resolves.toEqual(expect.any(String));
    expect(prisma.programSetting.update).not.toHaveBeenCalled();
    expect(m.row?.classBoardPinFailures).toBe(0);
  });
});
