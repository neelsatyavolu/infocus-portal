import { describe, expect, it } from "vitest";
import {
  applyCycleRequirementQuota,
  ASSOCIATE_REQUIRED_CYCLES,
  requiredCyclesForRole,
  semesterCheckInMax,
  STUDENT_REQUIRED_CYCLES,
  type CycleQuotaInput
} from "@/src/lib/package-cycle-requirements";

function cycle(partial: Partial<CycleQuotaInput> & Pick<CycleQuotaInput, "cycleNumber">): CycleQuotaInput {
  return {
    isMember: false,
    finalCutPoints: null,
    checkInPoints: null,
    checkInPossible: null,
    finalDeadlinePassed: false,
    ...partial
  };
}

describe("requiredCyclesForRole", () => {
  it("asks regular students for 3 S1 and 4 S2, associates for 2 and 3", () => {
    expect(requiredCyclesForRole(null, 1, 3)).toBe(STUDENT_REQUIRED_CYCLES[1]);
    expect(requiredCyclesForRole(null, 2, 4)).toBe(STUDENT_REQUIRED_CYCLES[2]);
    expect(requiredCyclesForRole("ASSOCIATE_PRODUCER", 1, 3)).toBe(ASSOCIATE_REQUIRED_CYCLES[1]);
    expect(requiredCyclesForRole("ASSOCIATE_PRODUCER", 2, 4)).toBe(ASSOCIATE_REQUIRED_CYCLES[2]);
  });

  it("never requires more cycles than exist in that semester", () => {
    expect(requiredCyclesForRole(null, 2, 1)).toBe(1);
    expect(requiredCyclesForRole("ASSOCIATE_PRODUCER", 2, 1)).toBe(1);
    expect(requiredCyclesForRole("ASSOCIATE_PRODUCER", 1, 0)).toBe(0);
  });

  it("gives S1 reporters 60 check-in points and associates 40", () => {
    expect(semesterCheckInMax(null, 1, 3)).toBe(60);
    expect(semesterCheckInMax("ASSOCIATE_PRODUCER", 1, 3)).toBe(40);
    expect(semesterCheckInMax(null, 2, 4)).toBe(80);
  });
});

describe("applyCycleRequirementQuota", () => {
  it("leaves regular student scores unchanged, including deadline zeros", () => {
    const cycles = [
      cycle({ cycleNumber: 1, isMember: true, finalCutPoints: 50, checkInPoints: 20, checkInPossible: 20 }),
      cycle({ cycleNumber: 2, isMember: false, finalCutPoints: 0, checkInPoints: 0, checkInPossible: 20, finalDeadlinePassed: true }),
      cycle({ cycleNumber: 3, isMember: true, finalCutPoints: null, checkInPoints: 5, checkInPossible: 5 })
    ];
    const result = applyCycleRequirementQuota(cycles, null);
    expect(result.displayFinalCutPoints).toEqual([50, 0, null]);
    expect(result.countedFinalCutPoints).toEqual([50, 0, null]);
    expect(result.countedCheckInPoints).toEqual([20, 0, 5]);
  });

  it("does not zero an associate skip while later cycles can still fill the quota", () => {
    const cycles = [
      cycle({
        cycleNumber: 1,
        isMember: true,
        finalCutPoints: 40,
        checkInPoints: 20,
        checkInPossible: 20,
        finalDeadlinePassed: true
      }),
      cycle({ cycleNumber: 2, isMember: false, finalDeadlinePassed: true }),
      cycle({ cycleNumber: 3, isMember: false, finalDeadlinePassed: false })
    ];
    const result = applyCycleRequirementQuota(cycles, "ASSOCIATE_PRODUCER");
    expect(result.displayFinalCutPoints).toEqual([40, null, null]);
    expect(result.countedFinalCutPoints).toEqual([40, null, null]);
    expect(result.displayCheckInPoints).toEqual([20, null, null]);
  });

  it("pads a missed associate quota with zeros once remaining finals have passed", () => {
    const cycles = [
      cycle({
        cycleNumber: 1,
        isMember: true,
        finalCutPoints: 50,
        checkInPoints: 20,
        checkInPossible: 20,
        finalDeadlinePassed: true
      }),
      cycle({ cycleNumber: 2, isMember: false, finalDeadlinePassed: true }),
      cycle({ cycleNumber: 3, isMember: false, finalDeadlinePassed: true })
    ];
    const result = applyCycleRequirementQuota(cycles, "ASSOCIATE_PRODUCER");
    expect(result.displayFinalCutPoints).toEqual([50, 0, null]);
    expect(result.countedFinalCutPoints).toEqual([50, 0, null]);
    expect(result.countedCheckInPoints).toEqual([20, 0, null]);
    expect(result.countedCheckInPossible).toEqual([20, 20, null]);
  });

  it("counts an associate's best two S1 packages when they join three", () => {
    const cycles = [
      cycle({ cycleNumber: 1, isMember: true, finalCutPoints: 30, checkInPoints: 10, checkInPossible: 20 }),
      cycle({ cycleNumber: 2, isMember: true, finalCutPoints: 50, checkInPoints: 20, checkInPossible: 20 }),
      cycle({ cycleNumber: 3, isMember: true, finalCutPoints: 40, checkInPoints: 15, checkInPossible: 20 })
    ];
    const result = applyCycleRequirementQuota(cycles, "ASSOCIATE_PRODUCER");
    expect(result.displayFinalCutPoints).toEqual([30, 50, 40]);
    expect(result.countedFinalCutPoints).toEqual([null, 50, 40]);
    expect(result.countedCheckInPoints).toEqual([null, 20, 15]);
  });

  it("applies the S2 quota separately from S1", () => {
    const cycles = [
      cycle({ cycleNumber: 1, isMember: true, finalCutPoints: 50, checkInPoints: 20, checkInPossible: 20 }),
      cycle({ cycleNumber: 2, isMember: true, finalCutPoints: 50, checkInPoints: 20, checkInPossible: 20 }),
      cycle({ cycleNumber: 4, isMember: true, finalCutPoints: 40, checkInPoints: 20, checkInPossible: 20 }),
      cycle({ cycleNumber: 5, isMember: false, finalDeadlinePassed: true }),
      cycle({ cycleNumber: 6, isMember: true, finalCutPoints: 50, checkInPoints: 20, checkInPossible: 20 }),
      cycle({ cycleNumber: 7, isMember: false, finalDeadlinePassed: true })
    ];
    const result = applyCycleRequirementQuota(cycles, "ASSOCIATE_PRODUCER");
    expect(result.countedFinalCutPoints).toEqual([50, 50, 40, 0, 50, null]);
  });
});


it("does not reinstate an explicitly excluded final cut as a missed-quota zero", () => {
  const result = applyCycleRequirementQuota([
    cycle({ cycleNumber: 1, finalDeadlinePassed: true, finalCutExcluded: true })
  ], "ASSOCIATE_PRODUCER");
  expect(result.displayFinalCutPoints).toEqual([null]);
  expect(result.countedFinalCutPoints).toEqual([null]);
  expect(result.countedCheckInPoints).toEqual([0]);
});

it("identifies counted cycles when a fully excluded optional cycle is dropped", () => {
  const result = applyCycleRequirementQuota([
    cycle({ cycleNumber: 1, isMember: true, checkInPoints: 20, checkInPossible: 20 }),
    cycle({ cycleNumber: 2, isMember: true, checkInPoints: 20, checkInPossible: 20 }),
    cycle({ cycleNumber: 3, isMember: true })
  ], "ASSOCIATE_PRODUCER");
  expect(result.countedCycles).toEqual([true, true, false]);
});
