import { describe, expect, it } from "vitest";
import { resolveAssistantDoc, runAssistantDocTool, searchAssistantDocs } from "@/src/server/assistant-docs";

describe("assistant docs allowlist", () => {
  it("rejects path traversal and unknown ids", () => {
    expect(resolveAssistantDoc("../package.json")).toBeNull();
    expect(resolveAssistantDoc("knowledge/overview")).toBeNull();
    expect(resolveAssistantDoc("nope")).toBeNull();
  });

  it("reads a knowledge file by id", () => {
    const result = runAssistantDocTool("read_doc", { id: "overview" }) as {
      id?: string;
      content?: string;
    };
    expect(result.id).toBe("overview");
    expect(result.content).toContain("InFocus Portal");
  });

  it("searches across docs", () => {
    const hits = searchAssistantDocs("publishing queue");
    expect(hits.some((hit) => hit.id === "publishing-queue")).toBe(true);
  });

  it("lists docs without exposing repo paths outside docs/", () => {
    const result = runAssistantDocTool("list_docs", {}) as { docs: Array<{ id: string }> };
    const ids = result.docs.map((doc) => doc.id);
    expect(ids).toContain("overview");
    expect(ids).toContain("class-rules-2026-27");
    expect(ids).not.toContain("AGENTS");
  });

  it("hides producer docs from reporters", () => {
    const result = runAssistantDocTool("list_docs", {}, "member") as { docs: Array<{ id: string }> };
    const ids = result.docs.map((doc) => doc.id);
    expect(ids).toContain("student-work");
    expect(ids).not.toContain("publishing-queue");
    expect(ids).not.toContain("members");
    expect(ids).not.toContain("accounts-and-admin");
    expect(runAssistantDocTool("read_doc", { id: "publishing-queue" }, "member")).toMatchObject({
      error: expect.stringMatching(/Unknown doc/)
    });
  });
});
