import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PACKAGES_PER_SHOW,
  QUEUE_NO_EMPTY_SHOW_MESSAGE,
  QUEUE_SHOW_FULL_MESSAGE,
  UNASSIGNED_SHOW_KEY,
  buildShowOccupancy,
  canManuallyPlaceOnShow,
  groupPastQueueSections,
  groupQueueSections,
  isPastQueuedShowDate,
  pickAutomaticShowDate,
  resolveQueuedShowDate
} from "@/src/lib/publishing-queue";
import { setQueuedForAir } from "@/src/server/publishing-queue";

const upcoming = ["2026-09-04", "2026-09-09", "2026-09-11"];

describe("publishing queue occupancy", () => {
  it("caps manual placement at 2 packages per show", () => {
    expect(MAX_PACKAGES_PER_SHOW).toBe(2);
    expect(canManuallyPlaceOnShow(0)).toBe(true);
    expect(canManuallyPlaceOnShow(1)).toBe(true);
    expect(canManuallyPlaceOnShow(2)).toBe(false);
  });

  it("auto-assigns the next show with zero packages", () => {
    const occupancy = buildShowOccupancy([
      { id: "a", queuedForShowDate: "2026-09-04" },
      { id: "b", queuedForShowDate: "2026-09-04" }
    ]);
    expect(pickAutomaticShowDate(upcoming, occupancy)).toBe("2026-09-09");
  });

  it("skips a show that already has one package when auto-assigning", () => {
    const occupancy = buildShowOccupancy([{ id: "a", queuedForShowDate: "2026-09-04" }]);
    expect(pickAutomaticShowDate(upcoming, occupancy)).toBe("2026-09-09");
  });

  it("returns null when every upcoming show already has a package", () => {
    const occupancy = buildShowOccupancy([
      { id: "a", queuedForShowDate: "2026-09-04" },
      { id: "b", queuedForShowDate: "2026-09-09" },
      { id: "c", queuedForShowDate: "2026-09-11" }
    ]);
    expect(pickAutomaticShowDate(upcoming, occupancy)).toBeNull();
  });

  it("lets a producer stack a second package on a show by hand", () => {
    expect(
      resolveQueuedShowDate({
        requestedShowDate: "2026-09-04",
        currentShowDate: null,
        upcomingShows: upcoming,
        occupancy: buildShowOccupancy([{ id: "a", queuedForShowDate: "2026-09-04" }])
      })
    ).toBe("2026-09-04");
  });

  it("rejects a third package on the same show", () => {
    expect(() =>
      resolveQueuedShowDate({
        requestedShowDate: "2026-09-04",
        currentShowDate: null,
        upcomingShows: upcoming,
        occupancy: buildShowOccupancy([
          { id: "a", queuedForShowDate: "2026-09-04" },
          { id: "b", queuedForShowDate: "2026-09-04" }
        ])
      })
    ).toThrow(QUEUE_SHOW_FULL_MESSAGE);
  });

  it("allows leaving a package on a full show it already occupies", () => {
    expect(
      resolveQueuedShowDate({
        requestedShowDate: "2026-09-04",
        currentShowDate: "2026-09-04",
        upcomingShows: upcoming,
        occupancy: buildShowOccupancy([{ id: "other", queuedForShowDate: "2026-09-04" }])
      })
    ).toBe("2026-09-04");
  });

  it("keeps the current show when re-queuing without a date", () => {
    expect(
      resolveQueuedShowDate({
        requestedShowDate: null,
        currentShowDate: "2026-09-04",
        upcomingShows: upcoming,
        occupancy: buildShowOccupancy([{ id: "other", queuedForShowDate: "2026-09-04" }])
      })
    ).toBe("2026-09-04");
  });

  it("auto-assigns an empty show when first queued", () => {
    expect(
      resolveQueuedShowDate({
        requestedShowDate: null,
        currentShowDate: null,
        upcomingShows: upcoming,
        occupancy: buildShowOccupancy([{ id: "a", queuedForShowDate: "2026-09-04" }])
      })
    ).toBe("2026-09-09");
  });

  it("errors when auto-assign has no empty show", () => {
    expect(() =>
      resolveQueuedShowDate({
        requestedShowDate: null,
        currentShowDate: null,
        upcomingShows: upcoming,
        occupancy: buildShowOccupancy([
          { id: "a", queuedForShowDate: "2026-09-04" },
          { id: "b", queuedForShowDate: "2026-09-09" },
          { id: "c", queuedForShowDate: "2026-09-11" }
        ])
      })
    ).toThrow(QUEUE_NO_EMPTY_SHOW_MESSAGE);
  });

  it("keeps empty upcoming shows as drop lanes", () => {
    const sections = groupQueueSections(
      [{ id: "a", queuedForShowDate: "2026-09-09" }],
      upcoming
    );
    expect(sections.map((section) => [section.date, section.rows.length])).toEqual([
      ["2026-09-04", 0],
      ["2026-09-09", 1],
      ["2026-09-11", 0]
    ]);
  });

  it("appends unassigned packages after dated shows", () => {
    const sections = groupQueueSections(
      [
        { id: "a", queuedForShowDate: "2026-09-04" },
        { id: "b", queuedForShowDate: null }
      ],
      ["2026-09-04"]
    );
    expect(sections.at(-1)?.date).toBe(UNASSIGNED_SHOW_KEY);
    expect(sections.at(-1)?.rows.map((row) => row.id)).toEqual(["b"]);
  });

  it("treats a date before today as past when it is not upcoming", () => {
    expect(isPastQueuedShowDate("2026-09-04", ["2026-09-09", "2026-09-11"], "2026-09-08")).toBe(true);
    expect(isPastQueuedShowDate("2026-09-09", ["2026-09-09", "2026-09-11"], "2026-09-08")).toBe(false);
    expect(isPastQueuedShowDate(null, ["2026-09-09"], "2026-09-08")).toBe(false);
  });

  it("omits past show dates from the live queue", () => {
    const sections = groupQueueSections(
      [
        { id: "past", queuedForShowDate: "2026-09-04" },
        { id: "live", queuedForShowDate: "2026-09-11" }
      ],
      ["2026-09-09", "2026-09-11"],
      "2026-09-08"
    );
    expect(sections.map((section) => [section.date, section.rows.map((row) => row.id)])).toEqual([
      ["2026-09-09", []],
      ["2026-09-11", ["live"]]
    ]);
  });

  it("keeps a future show that is not in the upcoming window on the live queue", () => {
    const sections = groupQueueSections(
      [{ id: "far", queuedForShowDate: "2026-12-02" }],
      ["2026-09-09", "2026-09-11"],
      "2026-09-08"
    );
    expect(sections.at(-1)?.date).toBe("2026-12-02");
  });

  it("groups past shows newest first", () => {
    const sections = groupPastQueueSections(
      [
        { id: "a", queuedForShowDate: "2026-09-04" },
        { id: "b", queuedForShowDate: "2026-09-09" },
        { id: "c", queuedForShowDate: "2026-09-11" },
        { id: "d", queuedForShowDate: null }
      ],
      ["2026-09-11"],
      "2026-09-10"
    );
    expect(sections.map((section) => [section.date, section.rows.map((row) => row.id)])).toEqual([
      ["2026-09-09", ["b"]],
      ["2026-09-04", ["a"]]
    ]);
  });
});

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  listUpcomingShows: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: {
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      findMany: mocks.findMany,
      update: mocks.update
    }
  }
}));

vi.mock("@/src/server/show-schedule", () => ({
  listUpcomingShows: mocks.listUpcomingShows
}));

describe("setQueuedForAir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUpcomingShows.mockResolvedValue(upcoming);
    mocks.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "row_1", ...data })
    );
  });

  it("picks the next empty show when first queued without a date", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      finalCutMediaItemId: "media_1",
      queuedForAirAt: null,
      queuedForShowDate: null
    });
    mocks.findMany.mockResolvedValue([{ id: "other", queuedForShowDate: "2026-09-04" }]);

    const row = await setQueuedForAir("row_1", true);

    expect(row.queuedForShowDate).toBe("2026-09-09");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: {
        queuedForAirAt: expect.any(Date),
        queuedForShowDate: "2026-09-09"
      }
    });
  });

  it("lets a producer manually stack a second package", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      finalCutMediaItemId: "media_1",
      queuedForAirAt: null,
      queuedForShowDate: null
    });
    mocks.findMany.mockResolvedValue([{ id: "other", queuedForShowDate: "2026-09-04" }]);

    const row = await setQueuedForAir("row_1", true, "2026-09-04");
    expect(row.queuedForShowDate).toBe("2026-09-04");
  });

  it("rejects a third package on the same show", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      finalCutMediaItemId: "media_1",
      queuedForAirAt: null,
      queuedForShowDate: null
    });
    mocks.findMany.mockResolvedValue([
      { id: "a", queuedForShowDate: "2026-09-04" },
      { id: "b", queuedForShowDate: "2026-09-04" }
    ]);

    await expect(setQueuedForAir("row_1", true, "2026-09-04")).rejects.toThrow(QUEUE_SHOW_FULL_MESSAGE);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("clears the show date when removed from the queue", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      finalCutMediaItemId: "media_1",
      queuedForAirAt: new Date("2026-08-21T12:00:00.000Z"),
      queuedForShowDate: "2026-09-04"
    });

    await setQueuedForAir("row_1", false);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: { queuedForAirAt: null, queuedForShowDate: null }
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
