import { describe, expect, it } from "vitest";
import { groupScheduleStatus, type GroupScheduleInput } from "@/src/lib/group-schedule";

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

function input(overrides: Partial<GroupScheduleInput> = {}): GroupScheduleInput {
  return {
    dates: {
      pitching: day("2026-10-02"),
      proofOfContact: day("2026-10-07"),
      aRollBRoll: day("2026-10-14"),
      initialCut: day("2026-10-21"),
      finalCut: day("2026-10-28")
    },
    done: { pitching: false, proofOfContact: false, aRollBRoll: false, initialCut: false, finalCut: false },
    extensionDays: 0,
    // Noon Pacific (PDT) on Oct 12.
    now: new Date("2026-10-12T19:00:00.000Z"),
    ...overrides
  };
}

describe("groupScheduleStatus", () => {
  it("is on track when every passed deadline is approved", () => {
    expect(
      groupScheduleStatus(input({ done: { pitching: true, proofOfContact: true, aRollBRoll: false, initialCut: false, finalCut: false } }))
    ).toEqual({ label: "On track", tone: "approved", daysBehind: 0 });
  });

  it("counts days from the earliest missed deadline", () => {
    // Pitch closed 11:59 PM Pacific Oct 2; noon Oct 12 is 10 days late.
    expect(groupScheduleStatus(input())).toEqual({ label: "Behind by 10d", tone: "danger", daysBehind: 10 });
    expect(
      groupScheduleStatus(input({ done: { pitching: true, proofOfContact: false, aRollBRoll: false, initialCut: false, finalCut: false } }))
    ).toMatchObject({ label: "Behind by 5d", daysBehind: 5 });
  });

  it("is not behind until the deadline closes at 11:59 PM Pacific", () => {
    const done = { pitching: true, proofOfContact: false, aRollBRoll: false, initialCut: false, finalCut: false };
    expect(groupScheduleStatus(input({ done, now: new Date("2026-10-08T06:30:00.000Z") }))).toMatchObject({ label: "On track" });
    expect(groupScheduleStatus(input({ done, now: new Date("2026-10-08T07:30:00.000Z") }))).toMatchObject({ label: "Behind by 1d" });
  });

  it("shifts every deadline by the approved extension", () => {
    const done = { pitching: true, proofOfContact: false, aRollBRoll: false, initialCut: false, finalCut: false };
    expect(groupScheduleStatus(input({ done, extensionDays: 5 }))).toMatchObject({ label: "On track" });
    expect(groupScheduleStatus(input({ done, extensionDays: 3 }))).toMatchObject({ label: "Behind by 2d" });
  });

  it("skips stages with no date and shows nothing when the cycle has no deadlines", () => {
    expect(
      groupScheduleStatus(input({ dates: { ...input().dates, pitching: null } }))
    ).toMatchObject({ label: "Behind by 5d" });
    expect(
      groupScheduleStatus(input({ dates: { pitching: null, proofOfContact: null, aRollBRoll: null, initialCut: null, finalCut: null } }))
    ).toBeNull();
  });
});
