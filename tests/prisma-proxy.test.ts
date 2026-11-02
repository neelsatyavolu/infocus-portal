import { afterEach, describe, expect, it, vi } from "vitest";

// The real client behind the lazy `prisma` export, pointed at a port nothing listens on: calls must
// reach Prisma's engine (and fail to connect), not die in the Proxy.
describe("prisma export (real client, no database)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  it("dispatches model, raw and transaction calls to the client", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:1/none?connect_timeout=1");
    vi.stubEnv("DIRECT_URL", "postgresql://user:pass@127.0.0.1:1/none?connect_timeout=1");
    delete (globalThis as { prisma?: unknown }).prisma;
    const { prisma } = await import("@/src/lib/prisma");

    expect(typeof prisma.user.findMany).toBe("function");
    expect(typeof prisma.$transaction).toBe("function");
    expect(prisma.user).toBe(prisma.user);
    // Through the pg driver adapter a refused connection is a known request error (P1001).
    const connectFailed = { name: expect.stringMatching(/^PrismaClient(Initialization|KnownRequest)Error$/) };
    await expect(prisma.user.count()).rejects.toMatchObject(connectFailed);
    await expect(prisma.$queryRaw`SELECT 1`).rejects.toMatchObject(connectFailed);
    await expect(prisma.$transaction(async (tx) => tx.user.count())).rejects.toMatchObject(connectFailed);
  }, 30_000);
});
