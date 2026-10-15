import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/prisma", () => ({ prisma: { platformAccessRequest: { findMany } } }));

import { listAccessRequests } from "@/src/server/platform-admin-lists";

describe("listAccessRequests", () => {
  it("puts pending requests first, then the newest", async () => {
    const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`);
    findMany.mockResolvedValue([
      { id: "approved-new", status: "APPROVED", requestedAt: at(9) },
      { id: "pending-old", status: "PENDING", requestedAt: at(1) },
      { id: "denied", status: "DENIED", requestedAt: at(8) },
      { id: "pending-new", status: "PENDING", requestedAt: at(5) }
    ]);
    expect((await listAccessRequests()).map((request) => request.id)).toEqual([
      "pending-new",
      "pending-old",
      "approved-new",
      "denied"
    ]);
  });
});
