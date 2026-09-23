import { describe, expect, it } from "vitest";
import { anonymizeFeedback, sampleFeedback, summarizeQuality } from "@/src/lib/associate-feedback-quality";
const notes = [{ id: "1", rowId: "g1", topic: "Private title", stage: "a-roll", body: "Iris: tighten the framing so the subject is clear.", createdAt: "2026-09-01" }];
describe("consistent feedback quality", () => {
  it("redacts identities, emails and links", () => {
    expect(anonymizeFeedback("Iris contact test@example.com https://example.com", ["Iris"]))
      .toBe("[person] contact [email] [link]");
  });
  it("samples deterministically, bounds input, and removes duplicate comments", () => {
    expect(sampleFeedback([...notes, { ...notes[0], id: "2" }], ["Iris"])).toHaveLength(1);
    expect(sampleFeedback(notes, ["Iris"])[0].text).not.toContain("Iris");
    expect(sampleFeedback(Array.from({ length: 30 }, (_, i) => ({ ...notes[0], id: String(i), rowId: `g${i}`, body: "x".repeat(1000) })), [])).toHaveLength(12);
  });
  it("rejects invented evidence and missing samples", () => {
    const sample = sampleFeedback(notes, []);
    const item = { ref: "F1", specificity: 4, actionability: 4, reasoning: 4, constructiveness: 4, reason: "Concrete guidance", quote: "made up" };
    expect(() => summarizeQuality({ items: [item] }, sample)).toThrow("Unsupported");
    expect(() => summarizeQuality({ items: [{ ...item, quote: "tighten the framing" }] }, [...sample, { ...sample[0], ref: "F2" }])).toThrow("coverage");
    expect(summarizeQuality({ items: [{ ...item, quote: "tighten the framing" }] }, sample).score).toBe(100);
  });
});
