import { describe, expect, it } from "vitest";
import { resolveSignInReturnTo, sanitizeReturnTo } from "@/src/lib/auth";

describe("sanitizeReturnTo keeps relative values on this origin", () => {
  it("rejects backslash and control-character paths that resolve to another host", () => {
    for (const value of ["/\\evil.example", "/\\/evil.example", "/\t/evil.example", "/\n/evil.example", "/\\\\evil.example"]) {
      expect(sanitizeReturnTo(value)).toBe("/dashboard");
      // What the callback and sign-out routes do with the result.
      expect(new URL(sanitizeReturnTo(value), "https://portal.example.edu").origin).toBe("https://portal.example.edu");
    }
  });

  it("keeps an encoded backslash on this origin", () => {
    const safe = sanitizeReturnTo("/%5Cevil.example");
    expect(new URL(safe, "https://portal.example.edu").origin).toBe("https://portal.example.edu");
  });

  it("applies the /api/ and /sign-in exclusions after resolving", () => {
    expect(sanitizeReturnTo("/groups/../api/auth/sign-out")).toBe("/dashboard");
    expect(sanitizeReturnTo("/x/../sign-in")).toBe("/dashboard");
  });

  it("still returns ordinary paths unchanged", () => {
    expect(sanitizeReturnTo("/groups?tab=a#top")).toBe("/groups?tab=a#top");
    expect(sanitizeReturnTo("/package-progress")).toBe("/package-progress");
    expect(sanitizeReturnTo("/x", "/home")).toBe("/x");
    expect(sanitizeReturnTo("//evil.example", "/home")).toBe("/home");
    expect(resolveSignInReturnTo("/\\evil.example", "https://portal.example.edu")).toBe("/dashboard");
  });
});
