import { describe, expect, it } from "vitest";
import { splitMarkdownSections } from "@/src/lib/meetings/notes-markdown";
import { isValidInviteEmail } from "@/components/meetings/tab/invites-panel";
import { readScribeParams } from "@/components/meetings/scribe/scribe-session";

describe("splitMarkdownSections", () => {
  it("splits on headings and keeps body text", () => {
    const sections = splitMarkdownSections("Intro line\n\n## Decisions\n- Ship it\n\n## Action items\n- **Abby**: edit\n");
    expect(sections.map((s) => s.heading)).toEqual([null, "Decisions", "Action items"]);
    expect(sections[2].body).toContain("**Abby**");
  });

  it("drops empty sections", () => {
    const sections = splitMarkdownSections("\n\n# Summary\n");
    expect(sections.map((s) => s.heading)).toEqual(["Summary"]);
  });
});

describe("isValidInviteEmail", () => {
  it("accepts normal addresses and rejects junk", () => {
    expect(isValidInviteEmail("adviser@example.edu")).toBe(true);
    expect(isValidInviteEmail("no-at-sign")).toBe(false);
    expect(isValidInviteEmail("a b@example.edu")).toBe(false);
    expect(isValidInviteEmail("x@y")).toBe(false);
  });
});

describe("readScribeParams", () => {
  it("parses the fragment", () => {
    expect(readScribeParams("#mid=m1&room=https%3A%2F%2Froom.example.edu&token=a.b&key=k&epoch=2")).toEqual({
      mid: "m1",
      room: "https://room.example.edu",
      token: "a.b",
      key: "k",
      epoch: 2
    });
  });

  it("rejects missing fields", () => {
    expect(readScribeParams("#mid=m1&room=r&token=t&key=k")).toBeNull();
    expect(readScribeParams("")).toBeNull();
  });
});
