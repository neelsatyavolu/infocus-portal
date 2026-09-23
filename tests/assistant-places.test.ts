import { describe, expect, it } from "vitest";
import {
  findGatedAssistantPlace,
  isMyPackageQuery,
  matchAssistantPlace,
  normalizePlaceQuery
} from "@/src/lib/assistant-places";

describe("normalizePlaceQuery", () => {
  it("strips where-is phrasing", () => {
    expect(normalizePlaceQuery("Where is Groups?")).toBe("groups");
    expect(normalizePlaceQuery("where's the publishing queue")).toBe("publishing queue");
    expect(normalizePlaceQuery("take me to Grade Editor")).toBe("grade editor");
  });
});

describe("matchAssistantPlace", () => {
  it("sends producers to Groups and reporters to cycle tabs", () => {
    expect(matchAssistantPlace("groups", "associate")).toMatchObject({
      title: "Groups",
      href: "/groups"
    });
    expect(matchAssistantPlace("Where is Brainstorming?", "member")).toMatchObject({
      title: "Brainstorming",
      href: "/brainstorming"
    });
    expect(matchAssistantPlace("grades", "member")).toMatchObject({
      title: "Grades",
      href: "/grades"
    });
    expect(matchAssistantPlace("the queue", "executive")).toMatchObject({
      title: "Publishing Queue",
      href: "/publishing-queue"
    });
  });

  it("does not offer producer pages to reporters", () => {
    expect(matchAssistantPlace("groups", "member")).toBeNull();
    expect(matchAssistantPlace("grade editor", "member")).toBeNull();
    expect(matchAssistantPlace("grades", "executive")).toMatchObject({
      title: "Grade Editor",
      href: "/grade-editor"
    });
    expect(findGatedAssistantPlace("groups", "member")?.title).toBe("Groups");
    expect(findGatedAssistantPlace("Grade Editor", "associate")?.title).toBe("Grade Editor");
  });

  it("opens Drive in a new tab", () => {
    expect(matchAssistantPlace("drive", "member")).toMatchObject({
      title: "InFocus Drive",
      href: "https://drive.infocuspaly.com",
      external: true,
      newTab: true
    });
  });
});

describe("isMyPackageQuery", () => {
  it("treats my package as a package lookup, not Groups", () => {
    expect(isMyPackageQuery("where is my package")).toBe(true);
    expect(isMyPackageQuery("groups")).toBe(false);
    expect(isMyPackageQuery("packages")).toBe(false);
  });
});
