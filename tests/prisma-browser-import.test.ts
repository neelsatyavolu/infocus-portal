import { afterEach, describe, expect, it, vi } from "vitest";

// Client bundles reach src/lib/prisma.ts through shared libs (platform-admin). In the browser,
// @prisma/client's stub throws on any property access, so importing the module must not touch one.
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      return new Proxy({}, {
        get() {
          throw new Error("PrismaClient is unable to run in this browser environment");
        }
      });
    }
  }
}));

describe("src/lib/prisma in the browser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  it("imports without touching the browser PrismaClient stub", async () => {
    vi.stubGlobal("window", {});

    await expect(import("@/src/lib/prisma")).resolves.toBeDefined();
  });
});
