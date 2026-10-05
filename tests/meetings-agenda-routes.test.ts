import { beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; meetingId: string; text: string; position: number; done: boolean; doneAt: Date | null; doneById: string | null; createdAt: Date };

const mocks = vi.hoisted(() => ({
  viewer: { id: "u-abby", role: "ASSOCIATE_PRODUCER" as string | null },
  meeting: null as null | { id: string; status: string; access: string; createdById: string | null; inviteeUserIds: string[] },
  items: [] as Item[],
  roomEvent: vi.fn(async () => true)
}));

const agendaTable = vi.hoisted(() => {
  const sorted = () =>
    [...mocks.items].sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
  return {
    findMany: vi.fn(async ({ where, select }: { where: { meetingId: string }; select?: Record<string, boolean> }) => {
      const rows = sorted().filter((i) => i.meetingId === where.meetingId);
      return select && Object.keys(select).length === 1 ? rows.map((r) => ({ id: r.id })) : rows;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.items.find((i) => i.id === where.id) ?? null),
    count: vi.fn(async ({ where }: { where: { meetingId: string } }) => mocks.items.filter((i) => i.meetingId === where.meetingId).length),
    create: vi.fn(async ({ data }: { data: { meetingId: string; text: string; position: number } }) => {
      const item: Item = { id: `i${mocks.items.length + 1}`, done: false, doneAt: null, doneById: null, createdAt: new Date(), ...data };
      mocks.items = [...mocks.items, item];
      return item;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Item> }) => {
      mocks.items = mocks.items.map((i) => (i.id === where.id ? { ...i, ...data } : i));
      return mocks.items.find((i) => i.id === where.id);
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      mocks.items = mocks.items.filter((i) => i.id !== where.id);
    })
  };
});

vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => mocks.viewer.id),
  syncUserProfile: vi.fn(async () => ({ id: mocks.viewer.id, email: `${mocks.viewer.id}@example.edu`, name: "Abby", nickname: null }))
}));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: vi.fn(async () => ({ role: mocks.viewer.role }))
}));
vi.mock("@/src/lib/prisma", () => {
  const client = {
    meeting: { findUnique: vi.fn(async () => mocks.meeting) },
    meetingAgendaItem: agendaTable,
    user: { findMany: vi.fn(async () => [{ id: "u-abby", name: "Abby", nickname: null, email: "abby@example.edu" }]) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(client))
  };
  return { prisma: client };
});
vi.mock("@/src/server/meetings-room-client", () => ({ sendMeetingRoomEvent: mocks.roomEvent }));

import { GET as agendaGet, POST as agendaPost } from "@/app/api/meetings/[id]/agenda/route";
import { DELETE as itemDelete, PATCH as itemPatch } from "@/app/api/meetings/[id]/agenda/[itemId]/route";
import { PUT as orderPut } from "@/app/api/meetings/[id]/agenda/order/route";

const params = { params: Promise.resolve({ id: "m1" }) };
const itemParams = (itemId: string) => ({ params: Promise.resolve({ id: "m1", itemId }) });
const req = (method: string, body?: unknown) =>
  new Request("https://portal.example.edu/api/meetings/m1/agenda", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
const data = async (res: Response) => ((await res.json()) as { data: { items: Array<{ id: string; text: string; position: number; done: boolean; doneByName: string | null }>; readOnly: boolean } }).data;

function seed(...texts: string[]) {
  mocks.items = texts.map((text, i) => ({
    id: `i${i + 1}`,
    meetingId: "m1",
    text,
    position: i,
    done: false,
    doneAt: null,
    doneById: null,
    createdAt: new Date(2026, 9, 4, 0, 0, i)
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer = { id: "u-abby", role: "ASSOCIATE_PRODUCER" };
  mocks.meeting = { id: "m1", status: "LIVE", access: "OPEN", createdById: "u-sage", inviteeUserIds: [] };
  seed("Rundown", "Packages", "Shout-outs");
});

describe("agenda API", () => {
  it("lists in order for any producer", async () => {
    const body = await data(await agendaGet(req("GET"), params));
    expect(body.items.map((i) => i.text)).toEqual(["Rundown", "Packages", "Shout-outs"]);
    expect(body.readOnly).toBe(false);
  });

  it("hides invite-only and execs-only agendas from outsiders with a 404", async () => {
    mocks.meeting = { id: "m1", status: "LIVE", access: "INVITE_ONLY", createdById: "u-sage", inviteeUserIds: ["u-otto"] };
    expect((await agendaGet(req("GET"), params)).status).toBe(404);
    expect((await agendaPost(req("POST", { text: "x" }), params)).status).toBe(404);
    mocks.meeting = { id: "m1", status: "LIVE", access: "EXECS_ONLY", createdById: null, inviteeUserIds: [] };
    expect((await orderPut(req("PUT", { itemIds: ["i1", "i2", "i3"] }), params)).status).toBe(404);
  });

  it("rejects non-producers", async () => {
    mocks.viewer.role = null;
    expect((await agendaGet(req("GET"), params)).status).toBe(403);
  });

  it("appends trimmed text and pushes a room event while live", async () => {
    const res = await agendaPost(req("POST", { text: "   Next   week's  show  " }), params);
    expect(res.status).toBe(201);
    const body = await data(res);
    expect(body.items.at(-1)).toMatchObject({ text: "Next week's show", position: 3 });
    expect(mocks.roomEvent).toHaveBeenCalledWith("m1", expect.objectContaining({ t: "agenda" }));
  });

  it("validates text", async () => {
    expect((await agendaPost(req("POST", { text: "   " }), params)).status).toBe(400);
    expect((await agendaPost(req("POST", { text: "x".repeat(301) }), params)).status).toBe(400);
    expect((await agendaPost(req("POST", { text: "ok", extra: 1 }), params)).status).toBe(400);
    expect((await itemPatch(req("PATCH", {}), itemParams("i1"))).status).toBe(400);
  });

  it("checks off with who did it, and unchecks", async () => {
    const body = await data(await itemPatch(req("PATCH", { done: true }), itemParams("i2")));
    expect(body.items[1]).toMatchObject({ done: true, doneByName: "Abby" });
    const undone = await data(await itemPatch(req("PATCH", { done: false }), itemParams("i2")));
    expect(undone.items[1]).toMatchObject({ done: false, doneByName: null });
  });

  it("404s for an item of another meeting", async () => {
    mocks.items = [...mocks.items, { ...mocks.items[0], id: "other", meetingId: "m2" }];
    expect((await itemPatch(req("PATCH", { done: true }), itemParams("other"))).status).toBe(404);
    expect((await itemDelete(req("DELETE"), itemParams("other"))).status).toBe(404);
  });

  it("deletes and renumbers positions 0..n-1", async () => {
    const body = await data(await itemDelete(req("DELETE"), itemParams("i1")));
    expect(body.items.map((i) => [i.id, i.position])).toEqual([["i2", 0], ["i3", 1]]);
    expect(mocks.items.map((i) => i.position).sort()).toEqual([0, 1]);
  });

  it("reorders only with exactly the meeting's ids", async () => {
    const body = await data(await orderPut(req("PUT", { itemIds: ["i3", "i1", "i2"] }), params));
    expect(body.items.map((i) => i.id)).toEqual(["i3", "i1", "i2"]);
    expect(Object.fromEntries(mocks.items.map((i) => [i.id, i.position]))).toEqual({ i3: 0, i1: 1, i2: 2 });

    expect((await orderPut(req("PUT", { itemIds: ["i1", "i2"] }), params)).status).toBe(400);
    expect((await orderPut(req("PUT", { itemIds: ["i1", "i1", "i2"] }), params)).status).toBe(400);
    expect((await orderPut(req("PUT", { itemIds: ["i1", "i2", "zzz"] }), params)).status).toBe(400);
  });

  it("is read-only once the meeting is over, and skips room events when not live", async () => {
    mocks.meeting = { id: "m1", status: "ENDED", access: "OPEN", createdById: null, inviteeUserIds: [] };
    expect((await data(await agendaGet(req("GET"), params))).readOnly).toBe(true);
    const add = await agendaPost(req("POST", { text: "Late" }), params);
    expect(add.status).toBe(400);
    expect(((await add.json()) as { error: { message: string } }).error.message).toMatch(/over/);
    expect((await itemPatch(req("PATCH", { done: true }), itemParams("i1"))).status).toBe(400);
    expect((await orderPut(req("PUT", { itemIds: ["i3", "i2", "i1"] }), params)).status).toBe(400);

    mocks.meeting = { id: "m1", status: "SCHEDULED", access: "OPEN", createdById: null, inviteeUserIds: [] };
    expect((await itemPatch(req("PATCH", { done: true }), itemParams("i1"))).status).toBe(200);
    expect(mocks.roomEvent).not.toHaveBeenCalled();
  });
});
