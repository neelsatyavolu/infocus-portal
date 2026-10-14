import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bundled from "@/src/generated/assistant-docs.json";
import { listAssistantDocs, readAssistantDoc, resolveAssistantDoc } from "@/src/server/assistant-docs";

describe("bundled assistant docs", () => {
  it("contains every knowledge file and the three extra docs", () => {
    const onDisk = readdirSync("docs/knowledge")
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => `docs/knowledge/${entry}`);
    expect(Object.keys(bundled)).toEqual(
      expect.arrayContaining([...onDisk, "docs/class-rules-2026-27.md", "docs/NAS-STORAGE.md", "docs/SUBDOMAINS.md"])
    );
  });

  it("lists, resolves and reads docs from the bundle", () => {
    const docs = listAssistantDocs("executive");
    expect(docs.length).toBeGreaterThan(0);
    expect(resolveAssistantDoc(docs[0].id, "executive")).not.toBeNull();
    expect(readAssistantDoc(docs[0].id, "executive")?.content.length).toBeGreaterThan(0);
    expect(resolveAssistantDoc("../package", "executive")).toBeNull();
  });
});
