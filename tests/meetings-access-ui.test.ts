import { describe, expect, it } from "vitest";
import { accessTagLabel } from "@/components/meetings/tab/meeting-rows";
import { accessOptions } from "@/components/meetings/tab/schedule-dialog";

describe("accessTagLabel", () => {
  it("tags restricted meetings only", () => {
    expect(accessTagLabel({ access: "OPEN", inviteeCount: 0 })).toBeNull();
    expect(accessTagLabel({ access: "EXECS_ONLY", inviteeCount: 0 })).toBe("Execs only");
    expect(accessTagLabel({ access: "INVITE_ONLY", inviteeCount: 1 })).toBe("Invite only · 1 person");
    expect(accessTagLabel({ access: "INVITE_ONLY", inviteeCount: 3 })).toBe("Invite only · 3 people");
  });
});

describe("accessOptions (Who can join)", () => {
  it("offers Execs only and Only people I choose to execs only, in that order", () => {
    expect(accessOptions(true).map(([value]) => value)).toEqual(["OPEN", "EXECS_ONLY", "INVITE_ONLY"]);
    expect(accessOptions(false).map(([value]) => value)).toEqual(["OPEN"]);
  });
});
