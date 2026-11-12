import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  upsert: vi.fn(),
  nonAnchorFindMany: vi.fn(),
  nonAnchorDeleteMany: vi.fn(),
  nonAnchorUpsert: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "user-1"),
  syncUserProfile: vi.fn(async () => ({ email: "ap@example.edu" }))
}));
vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: vi.fn(async () => ({ role: "ASSOCIATE_PRODUCER" })),
  hasPlatformRole: vi.fn(() => true)
}));
vi.mock("@/src/server/show-roles-history", () => ({
  withAssociateShowManagers: vi.fn(async (shows: unknown) => shows)
}));
vi.mock("@/src/lib/prisma", () => {
  const tx = {
    showRolesShow: { findMany: mocks.findMany, deleteMany: mocks.deleteMany, upsert: mocks.upsert },
    showRolesNonAnchor: {
      findMany: mocks.nonAnchorFindMany,
      deleteMany: mocks.nonAnchorDeleteMany,
      upsert: mocks.nonAnchorUpsert
    }
  };
  return { prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

import { POST } from "@/app/api/show-roles/data/route";
import { POST as postNonAnchors } from "@/app/api/show-roles/non-anchors/route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/show-roles/data", {
      method: "POST",
      body: JSON.stringify(body)
    }) as never
  );
}

const show = (date: string, assignments: Record<string, string> = {}, anchors: string[] = []) => ({
  date,
  assignments,
  anchors,
  confirmed: {}
});
const content = (value: ReturnType<typeof show>) => ({
  assignments: value.assignments,
  anchors: value.anchors,
  confirmed: value.confirmed
});

describe("POST /api/show-roles/data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects the old replace-everything body and never deletes", async () => {
    mocks.findMany.mockResolvedValue([]);
    const response = await post({ shows: [] });
    expect(response.status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("only upserts shows that differ from what is stored, leaving unmentioned shows alone", async () => {
    const stored = [
      show("2026-10-06", { TD: "Abby", Audio: "Otto" }, ["Sage"]),
      show("2026-10-08", { TD: "Abby" })
    ];
    mocks.findMany.mockResolvedValue(stored);

    const response = await post({
      shows: [
        show("2026-10-06", { Audio: "Otto", TD: "Abby" }, ["Sage"]),
        show("2026-10-08", { TD: "Otto" }),
        show("2026-10-10")
      ],
      base: {
        "2026-10-06": content(stored[0]),
        "2026-10-08": content(stored[1]),
        "2026-10-10": null
      },
      deletedDates: []
    });

    expect(response.status).toBe(200);
    expect(mocks.upsert.mock.calls.map(([args]) => args.where.date)).toEqual(["2026-10-08", "2026-10-10"]);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 409 and writes nothing when another tab changed a show this tab edits", async () => {
    mocks.findMany.mockResolvedValue([show("2026-10-08", { TD: "Sage" })]);

    const response = await post({
      shows: [show("2026-10-08", { TD: "Otto" })],
      base: { "2026-10-08": content(show("2026-10-08", { TD: "Abby" })) },
      deletedDates: []
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ conflicts: ["2026-10-08"] });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("deletes only the dates the client removed, by explicit filter", async () => {
    const removed = show("2026-10-01", { TD: "Abby" });
    mocks.findMany.mockResolvedValue([removed]);

    const response = await post({ shows: [], base: { "2026-10-01": content(removed) }, deletedDates: ["2026-10-01"] });

    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { date: { in: ["2026-10-01"] } } });
  });

  it("refuses to delete a show someone else changed", async () => {
    mocks.findMany.mockResolvedValue([show("2026-10-01", { TD: "Sage" })]);

    const response = await post({
      shows: [],
      base: { "2026-10-01": content(show("2026-10-01", { TD: "Abby" })) },
      deletedDates: ["2026-10-01"]
    });

    expect(response.status).toBe(409);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps the last copy of a repeated date", async () => {
    mocks.findMany.mockResolvedValue([show("2026-10-06", { TD: "Abby" })]);

    await post({
      shows: [show("2026-10-06", { TD: "Otto" }), show("2026-10-06", { TD: "Sage" })],
      base: { "2026-10-06": content(show("2026-10-06", { TD: "Abby" })) },
      deletedDates: []
    });

    expect(mocks.upsert.mock.calls.map(([args]) => args.update.assignments)).toEqual([{ TD: "Sage" }]);
  });
});

describe("POST /api/show-roles/non-anchors", () => {
  beforeEach(() => vi.clearAllMocks());

  function postBody(body: unknown) {
    return postNonAnchors(
      new Request("http://localhost/api/show-roles/non-anchors", {
        method: "POST",
        body: JSON.stringify(body)
      }) as never
    );
  }

  it("applies only the toggled names and returns the full list", async () => {
    mocks.nonAnchorFindMany.mockResolvedValue([{ name: "Abby" }, { name: "Sage" }]);

    const response = await postBody({ add: ["Sage"], remove: ["Otto"] });

    expect(response.status).toBe(200);
    expect(mocks.nonAnchorDeleteMany).toHaveBeenCalledWith({ where: { name: { in: ["Otto"] } } });
    expect(mocks.nonAnchorUpsert).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ nonAnchors: ["Abby", "Sage"] });
  });

  it("never runs an unfiltered delete", async () => {
    mocks.nonAnchorFindMany.mockResolvedValue([]);
    expect((await postBody({ nonAnchors: [] })).status).toBe(400);
    expect((await postBody({ add: [], remove: [] })).status).toBe(200);
    expect(mocks.nonAnchorDeleteMany).not.toHaveBeenCalled();
    expect((await postBody({ add: "Abby" })).status).toBe(400);
  });
});
