import { describe, expect, it } from "vitest";
import {
  ASSISTANT_USAGE,
  assistantAudience,
  assistantDocAllowed,
  assistantLookupNames,
  assistantUsageFor,
  assistantWhoLine
} from "@/src/lib/assistant-access";
import { assistantToolsFor } from "@/src/server/assistant-chat";

describe("assistantAudience", () => {
  it("maps platform roles", () => {
    expect(assistantAudience(null)).toBe("member");
    expect(assistantAudience("ASSOCIATE_PRODUCER")).toBe("associate");
    expect(assistantAudience("EXECUTIVE_PRODUCER")).toBe("executive");
    expect(assistantAudience("ADVISER")).toBe("admin");
    expect(assistantAudience("SUPER_ADMIN")).toBe("admin");
  });
});

describe("assistant lookup tools", () => {
  it("does not give reporters producer lookups or grades", () => {
    expect(assistantLookupNames("member")).toEqual(["list_groups", "get_group", "list_cycle_dates"]);
    expect(assistantLookupNames("member")).not.toContain("get_grades");
    expect(assistantLookupNames("member")).not.toContain("list_queue");
    expect(assistantLookupNames("member")).not.toContain("list_people");
  });

  it("does not give associates grades", () => {
    expect(assistantLookupNames("associate")).toContain("list_groups");
    expect(assistantLookupNames("associate")).toContain("list_queue");
    expect(assistantLookupNames("associate")).toContain("list_my_groups");
    expect(assistantLookupNames("associate")).not.toContain("get_grades");
    expect(assistantLookupNames("member")).not.toContain("list_my_groups");
  });

  it("gives executives and admin grades", () => {
    expect(assistantLookupNames("executive")).toContain("get_grades");
    expect(assistantLookupNames("admin")).toContain("get_grades");
  });

  it("omits hidden tools from the model list", () => {
    const memberTools = assistantToolsFor("member", false).map((tool) => tool.function.name);
    const associateTools = assistantToolsFor("associate", false).map((tool) => tool.function.name);
    expect(memberTools).not.toContain("get_grades");
    expect(memberTools).not.toContain("list_queue");
    expect(memberTools).not.toContain("propose_set_grade");
    expect(memberTools).toContain("show_place");
    expect(associateTools).not.toContain("get_grades");
    expect(associateTools).toContain("list_queue");
    expect(associateTools).toContain("show_place");
    expect(associateTools).toContain("list_my_groups");
    expect(memberTools).not.toContain("list_my_groups");
    expect(assistantToolsFor("admin", true).map((tool) => tool.function.name)).toContain("propose_set_grade");
  });
});

describe("assistant docs", () => {
  it("hides producer knowledge from reporters", () => {
    expect(assistantDocAllowed("student-work", "member")).toBe(true);
    expect(assistantDocAllowed("messages", "member")).toBe(true);
    expect(assistantDocAllowed("publishing-queue", "member")).toBe(false);
    expect(assistantDocAllowed("publishing-queue", "associate")).toBe(true);
  });
});

describe("assistantWhoLine", () => {
  it("names the signed-in producer so the model does not ask who they are", () => {
    expect(assistantWhoLine("associate", "Ada")).toContain("Ada");
    expect(assistantWhoLine("associate", "Ada")).toContain("associate producer");
    expect(assistantWhoLine("associate", "Ada")).toMatch(/never ask their name/i);
  });
});

describe("assistant usage", () => {
  it("gives execs more than associates, and associates more than members", () => {
    const member = assistantUsageFor("member");
    const associate = assistantUsageFor("associate");
    const executive = assistantUsageFor("executive");
    expect(executive.dayMax).toBeGreaterThan(associate.dayMax);
    expect(associate.dayMax).toBeGreaterThan(member.dayMax);
    expect(executive.burstMax).toBeGreaterThan(associate.burstMax);
    expect(associate.burstMax).toBeGreaterThan(member.burstMax);
    expect(ASSISTANT_USAGE.admin.dayMax).toBe(executive.dayMax);
  });
});
