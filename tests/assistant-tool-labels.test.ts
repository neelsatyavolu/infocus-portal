import { describe, expect, it } from "vitest";
import { assistantToolLabel } from "@/src/lib/assistant-tool-labels";

describe("assistantToolLabel", () => {
  it("uses everyday labels instead of tool names", () => {
    expect(assistantToolLabel("read_doc")).toBe("Reading a doc");
    expect(assistantToolLabel("get_grades")).toBe("Reading grades");
    expect(assistantToolLabel("list_people")).toBe("Looking up people");
    expect(assistantToolLabel("list_my_groups")).toBe("Looking up your groups");
    expect(assistantToolLabel("propose_set_grade")).toBe("Preparing a grade change");
    expect(assistantToolLabel("propose_add_person")).toBe("Preparing to add a person");
    expect(assistantToolLabel("show_place")).toBe("Finding that page");
  });

  it("falls back without exposing unknown tool ids", () => {
    expect(assistantToolLabel("propose_mystery")).toBe("Preparing a change");
    expect(assistantToolLabel("secret_fn")).toBe("Looking that up");
  });
});
