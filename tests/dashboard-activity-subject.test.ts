import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import { titleNamesVersion } from "@/src/server/dashboard-data";

describe("titleNamesVersion", () => {
  it("spots titles that already end with their version", () => {
    expect(titleNamesVersion("Initial Cut Version 6", 6)).toBe(true);
    expect(titleNamesVersion("Initial Cut v6 ", 6)).toBe(true);
  });

  it("keeps the suffix when the title doesn't name this version", () => {
    expect(titleNamesVersion("Final Cut", 6)).toBe(false);
    expect(titleNamesVersion("Initial Cut Version 16", 6)).toBe(false);
    expect(titleNamesVersion("Initial Cut Version 6", 7)).toBe(false);
  });
});
