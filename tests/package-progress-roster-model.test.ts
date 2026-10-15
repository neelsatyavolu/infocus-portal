import { describe, expect, it } from "vitest";

import {
  consecutiveWarning,
  currentCycleNumber,
  cycleSpanLabel,
  cycleStatus,
  DEFAULT_ROW,
  filterCounts,
  matchesFilter,
  mergeRosterUsers,
  rowStatus,
  serializeRows,
  withoutClientKey,
  type CycleTab,
  type FilterContext,
  type ProgressRow
} from "@/app/(app)/package-progress/roster-model";
import { activeCycleNumberFor } from "@/src/server/package-progress-data";

/** Stored deadline days are midnight UTC; they close at 11:59 PM Pacific that day. */
function day(key: string) {
  return `${key}T00:00:00.000Z`;
}

function cycle(cycleNumber: number, dates: Partial<NonNullable<CycleTab["dates"]>> = {}, focus = ""): CycleTab {
  return {
    cycleNumber,
    focus,
    dates: {
      pitching: null,
      proofOfContact: null,
      aRollBRoll: null,
      initialCut: null,
      finalCut: null,
      ...dates
    }
  };
}

function row(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return { ...DEFAULT_ROW, ...overrides };
}

const CYCLES = [
  cycle(1, { pitching: day("2026-08-20"), finalCut: day("2026-09-10") }),
  cycle(2, { pitching: day("2026-09-14"), initialCut: day("2026-10-16"), finalCut: day("2026-10-23") }),
  cycle(3, { finalCut: day("2026-12-04") }),
  cycle(4)
];

describe("currentCycleNumber", () => {
  const instants = [
    "2026-08-01T12:00:00.000Z",
    "2026-09-10T20:00:00.000Z", // cycle 1 Final Cut day, still open in Pacific time
    "2026-09-11T12:00:00.000Z",
    "2026-10-24T12:00:00.000Z",
    "2027-01-10T12:00:00.000Z"
  ];

  it.each(instants)("matches the server's activeCycleNumberFor at %s", (iso) => {
    const now = new Date(iso);
    const server = activeCycleNumberFor(
      CYCLES.map((entry) => ({
        cycleNumber: entry.cycleNumber,
        finalCutDate: entry.dates?.finalCut ? new Date(entry.dates.finalCut) : null
      })),
      now
    );
    expect(currentCycleNumber(CYCLES, now)).toBe(server);
  });

  it("sorts cycles before picking and is null with no cycles", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    expect(currentCycleNumber([...CYCLES].reverse(), now)).toBe(2);
    expect(currentCycleNumber([], now)).toBeNull();
  });

  it("falls back to the last cycle once every Final Cut has passed", () => {
    const allClosed = [cycle(1, { finalCut: day("2026-01-10") }), cycle(2, { finalCut: day("2026-02-10") })];
    expect(currentCycleNumber(allClosed, new Date("2026-06-01T12:00:00.000Z"))).toBe(2);
  });
});

describe("cycleStatus", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  const current = currentCycleNumber(CYCLES, now);

  it("uses the Cycle Dates words: Closed, Active, Planned", () => {
    expect(cycleStatus(CYCLES[0]!, current, now)).toBe("closed");
    expect(cycleStatus(CYCLES[1]!, current, now)).toBe("active");
    expect(cycleStatus(CYCLES[2]!, current, now)).toBe("planned");
  });

  it("has no tag for a later cycle without a Final Cut date", () => {
    expect(cycleStatus(CYCLES[3]!, current, now)).toBeNull();
  });
});

describe("cycle labels", () => {
  it("formats the span from the Pitch date to the Final Cut date in UTC (no off-by-one)", () => {
    expect(cycleSpanLabel(CYCLES[1]!)).toBe("Sep 14 – Oct 23");
    expect(cycleSpanLabel(CYCLES[0]!)).toBe("Aug 20 – Sep 10");
    expect(cycleSpanLabel(CYCLES[2]!)).toBeNull();
  });
});

describe("filters", () => {
  const rows = [
    row({ id: "a", assignedProducerUserId: "viewer", memberUserIds: ["abby", "otto"] }),
    row({ id: "b", assignedExecutiveProducerUserId: "ep", groupMembers: "Sage" }),
    row({ id: "c" }),
    row({ id: "d", assignedProducerUserId: "viewer", memberUserIds: ["rowan"] })
  ];
  const context: FilterContext = {
    previousTeammatesByUser: { abby: ["otto"], otto: ["abby"] },
    viewerUserId: "viewer"
  };

  it("matches each gap filter", () => {
    expect(rows.filter((entry) => matchesFilter("no-producer", entry, context)).map((entry) => entry.id)).toEqual(["c"]);
    // Legacy member text counts as members.
    expect(rows.filter((entry) => matchesFilter("no-members", entry, context)).map((entry) => entry.id)).toEqual(["c"]);
    expect(rows.filter((entry) => matchesFilter("repeat", entry, context)).map((entry) => entry.id)).toEqual(["a"]);
    expect(rows.filter((entry) => matchesFilter("mine", entry, context)).map((entry) => entry.id)).toEqual(["a", "d"]);
  });

  it("counts every filter over the whole list", () => {
    expect(filterCounts(rows, context)).toEqual({
      all: 4,
      "no-producer": 1,
      "no-members": 1,
      repeat: 1,
      mine: 2
    });
  });

  it("never matches Assigned to me without a signed-in viewer", () => {
    expect(matchesFilter("mine", rows[0]!, { ...context, viewerUserId: null })).toBe(false);
  });
});

describe("rowStatus", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");

  it("points an unsaved row at nothing and a saved row at its pending stage", () => {
    const fresh = rowStatus(row(), undefined, now);
    expect(fresh.href).toBeNull();
    expect(fresh.tile).toEqual({ label: "Pitch Pending", tone: "neutral" });
    expect(fresh.extension).toBeNull();

    const saved = rowStatus(row({ id: "g1", pitching: true, proofOfContact: true }), undefined, now);
    expect(saved.href).toBe("/groups/g1/a-roll");
  });

  it("names an extension, with the time left before the extended Final Cut closes", () => {
    const dates = { pitching: null, proofOfContact: null, aRollBRoll: null, initialCut: null, finalCut: day("2026-09-21") };
    const extended = rowStatus({ ...row({ id: "g3", extension: true }), extensionDays: 3 }, dates, now);
    expect(extended.extension).toMatch(/^3 Day Extension - Due in \d+D$/);
    expect(rowStatus(row({ id: "g4" }), dates, now).extension).toBeNull();
  });
});

describe("row helpers", () => {
  it("names repeat pairs once each", () => {
    const users = new Map([
      ["abby", { id: "abby", name: "Abby Test", email: null }],
      ["otto", { id: "otto", name: "Otto Test", email: null }]
    ]);
    const warning = consecutiveWarning(["abby", "otto"], { abby: ["otto"], otto: ["abby"] }, users);
    // Full names, as text (two students can share a first name).
    expect(warning).toBe("Same group last cycle: Abby Test and Otto Test");
    expect(consecutiveWarning(["abby"], {}, users)).toBeNull();
  });

  it("adds linked members the people list is missing, once", () => {
    const merged = mergeRosterUsers(
      [{ id: "abby", name: "Abby", email: null }],
      [
        row({ members: [{ userId: "abby", name: "Abby", email: null }, { userId: "sage", name: "Sage", email: null }] }),
        row({ members: [{ userId: "sage", name: "Sage", email: null }] })
      ]
    );
    expect(merged.map((user) => user.id)).toEqual(["abby", "sage"]);
  });

  it("ignores ids and client keys when comparing rows, and never posts a client key", () => {
    expect(serializeRows([row({ id: "x", clientKey: "new-1" })])).toBe(serializeRows([row()]));
    expect(withoutClientKey(row({ clientKey: "new-1" })).clientKey).toBeUndefined();
  });
});
