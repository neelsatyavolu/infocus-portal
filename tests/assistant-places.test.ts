import { describe, expect, it } from "vitest";
import {
  ASSISTANT_PLACES,
  assistantCycleSwitch,
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

  it("sends producers to the Editing tab, like the Publishing Queue, and not reporters", () => {
    for (const query of ["editing", "Where is automatic editing?", "editing machines", "house rules"]) {
      expect(matchAssistantPlace(query, "associate"), query).toMatchObject({
        title: "Editing",
        href: "/editing",
        hint: "Left sidebar → The Show, then the Editing tab"
      });
    }
    expect(matchAssistantPlace("the show", "associate")).toMatchObject({ href: "/show-roles" });
    expect(matchAssistantPlace("editing", "member")).toBeNull();
    expect(findGatedAssistantPlace("editing", "member")?.title).toBe("Editing");
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
      href: "https://drive.infocusportal.com",
      external: true,
      newTab: true
    });
  });
});

describe("hints match the redesigned shell", () => {
  it("points account items at the account menu and keeps Settings in the sidebar", () => {
    expect(matchAssistantPlace("passwords", "associate")).toMatchObject({
      href: "/passwords",
      hint: expect.stringContaining("Account menu")
    });
    expect(matchAssistantPlace("appearance", "member")).toMatchObject({ title: "Settings", href: "/settings" });
  });

  it("names the Cycle guide and the hub tabs", () => {
    expect(matchAssistantPlace("information", "member")).toMatchObject({
      title: "Cycle guide",
      href: "/information",
      hint: expect.stringContaining("stage bar")
    });
    expect(matchAssistantPlace("pa script", "member")).toMatchObject({ href: "/announcements/pa" });
    expect(matchAssistantPlace("pa", "member")).toMatchObject({ href: "/master-calendar" });
    expect(matchAssistantPlace("admin", "executive")?.hint).toContain("Overview");
  });

  it("keeps every in-app href a root path", () => {
    for (const place of ASSISTANT_PLACES) {
      expect(place.external ? place.href.startsWith("https://") : place.href.startsWith("/")).toBe(true);
    }
  });
});

describe("isMyPackageQuery", () => {
  it("treats my package as a package lookup, not Groups", () => {
    expect(isMyPackageQuery("where is my package")).toBe(true);
    expect(isMyPackageQuery("groups")).toBe(false);
    expect(isMyPackageQuery("packages")).toBe(false);
  });
});

describe("assistantCycleSwitch", () => {
  const held = { cycleNumber: 2, choices: [2, 3] };

  it("offers a held student the other cycle as a switch card", () => {
    expect(assistantCycleSwitch(held, 3)).toMatchObject({
      preview: { id: "cycle-switch:3", title: "Switch to Cycle 3", switchToCycle: 3 }
    });
    expect(assistantCycleSwitch({ cycleNumber: 3, choices: [2, 3] }, 2).preview?.switchToCycle).toBe(2);
  });

  it("shows no card for the cycle they already have open", () => {
    const outcome = assistantCycleSwitch(held, 2);
    expect(outcome.preview).toBeUndefined();
    expect(outcome.result).toEqual({ alreadyOn: true, cycleNumber: 2 });
  });

  it("refuses cycles outside the two choices", () => {
    expect(assistantCycleSwitch(held, 1)).toEqual({ error: "You can switch between Cycle 2 and Cycle 3." });
  });

  it("refuses students who have only one cycle", () => {
    const outcome = assistantCycleSwitch({ cycleNumber: 3, choices: null }, 2);
    expect(outcome.preview).toBeUndefined();
    expect(outcome.error).toMatch(/only have Cycle 3/);
  });
});
