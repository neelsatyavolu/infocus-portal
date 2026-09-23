import { describe, expect, it } from "vitest";
import {
  MEMBER_GENERAL_CYCLE_NUMBER,
  isGeneralMemberNoteCycle,
  memberNoteCycleIsAllowed,
  memberNoteKey,
  parseMemberNoteCycle
} from "@/src/lib/member-notes";

describe("member notes", () => {
  it("treats cycle 0 as general notes", () => {
    expect(isGeneralMemberNoteCycle(MEMBER_GENERAL_CYCLE_NUMBER)).toBe(true);
    expect(isGeneralMemberNoteCycle(1)).toBe(false);
  });

  it("allows general notes plus real cycle numbers", () => {
    expect(memberNoteCycleIsAllowed(0, [1, 2, 3])).toBe(true);
    expect(memberNoteCycleIsAllowed(2, [1, 2, 3])).toBe(true);
    expect(memberNoteCycleIsAllowed(4, [1, 2, 3])).toBe(false);
    expect(memberNoteCycleIsAllowed(1.5, [1, 2, 3])).toBe(false);
  });

  it("parses cycle numbers including general", () => {
    expect(parseMemberNoteCycle(0)).toBe(0);
    expect(parseMemberNoteCycle(3)).toBe(3);
    expect(() => parseMemberNoteCycle(-1)).toThrow("BAD_REQUEST");
    expect(() => parseMemberNoteCycle(9)).toThrow("BAD_REQUEST");
    expect(() => parseMemberNoteCycle("1")).toThrow("BAD_REQUEST");
  });

  it("builds a stable draft key", () => {
    expect(memberNoteKey("u1", 0)).toBe("u1:0");
    expect(memberNoteKey("u1", 2)).toBe("u1:2");
  });
});
