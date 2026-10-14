import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { resolvePrismaClient } from "@/src/lib/prisma";

const fakeClient = () => ({}) as PrismaClient;

describe("resolvePrismaClient", () => {
  it("shares one client off Cloudflare Workers", () => {
    const make = vi.fn(fakeClient);
    const shared: { prisma: PrismaClient | undefined } = { prisma: undefined };
    const first = resolvePrismaClient(null, { shared, make });
    expect(resolvePrismaClient(null, { shared, make })).toBe(first);
    expect(make).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenCalledWith();
  });

  it("builds one client per Workers request, on that request's connection", () => {
    const make = vi.fn(fakeClient);
    const perRequest = new WeakMap<object, PrismaClient>();
    const a = { key: {}, connectionString: "postgres://hyperdrive-a" };
    const b = { key: {}, connectionString: "postgres://hyperdrive-b" };
    const forA = resolvePrismaClient(a, { perRequest, make });
    expect(resolvePrismaClient(a, { perRequest, make })).toBe(forA);
    expect(resolvePrismaClient(b, { perRequest, make })).not.toBe(forA);
    expect(make.mock.calls).toEqual([["postgres://hyperdrive-a"], ["postgres://hyperdrive-b"]]);
  });
});
