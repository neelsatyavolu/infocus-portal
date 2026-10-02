import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rows: vi.fn(),
  media: vi.fn(),
  update: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: { findMany: m.rows, update: m.update },
    mediaItem: { findMany: m.media }
  }
}));

import { recomputeCycleCutStatus } from "@/src/server/cycle-cut-status";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    groupMembers: "Abby, Otto",
    initialCut: false,
    finalCut: false,
    initialCutManual: false,
    finalCutManual: false,
    finalCutMediaItemId: null,
    ...overrides
  };
}

describe("recomputeCycleCutStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.media.mockResolvedValue([]);
  });

  it("marks Final Cut done when the row has a turned-in Final Cut", async () => {
    m.rows.mockResolvedValue([row({ finalCutMediaItemId: "media-1" })]);

    await recomputeCycleCutStatus(1);

    expect(m.update).toHaveBeenCalledWith({ where: { id: "row-1" }, data: { finalCut: true } });
  });

  it("keeps a turned-in Final Cut done without legacy folder media", async () => {
    m.rows.mockResolvedValue([row({ finalCut: true, finalCutMediaItemId: "media-1" })]);

    await recomputeCycleCutStatus(1);

    expect(m.update).not.toHaveBeenCalled();
  });

  it("still clears an automatic Final Cut flag when nothing was turned in", async () => {
    m.rows.mockResolvedValue([row({ finalCut: true })]);

    await recomputeCycleCutStatus(1);

    expect(m.update).toHaveBeenCalledWith({ where: { id: "row-1" }, data: { finalCut: false } });
  });
});
