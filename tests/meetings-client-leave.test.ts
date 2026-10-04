import { describe, expect, it } from "vitest";
import { leaveChoices } from "@/src/lib/meetings/client/leave";

const p = (uid: string, isHost = false, isScribe = false) => ({ uid, isHost, isScribe });

describe("leaveChoices", () => {
  it("non-hosts get Leave or Cancel", () => {
    expect(leaveChoices({ isHost: false, selfUid: "me", participants: [p("me"), p("abby", true)] })).toEqual({
      title: "Leave the meeting?",
      description: null,
      actions: ["leave", "cancel"]
    });
  });

  it("hosts also get End for everyone, with hand-off copy", () => {
    const choices = leaveChoices({ isHost: true, selfUid: "me", participants: [p("me", true), p("otto"), p("scribe", false, true)] });
    expect(choices.actions).toEqual(["leave", "end", "cancel"]);
    expect(choices.description).toMatch(/next exec/);
  });

  it("says other hosts keep running it when there are some", () => {
    const choices = leaveChoices({ isHost: true, selfUid: "me", participants: [p("me", true), p("sage", true)] });
    expect(choices.description).toBe("Other hosts will keep running the meeting.");
  });

  it("covers a host alone (the scribe doesn't count)", () => {
    const choices = leaveChoices({ isHost: true, selfUid: "me", participants: [p("me", true), p("scribe", false, true)] });
    expect(choices.description).toMatch(/only one here/);
  });
});
