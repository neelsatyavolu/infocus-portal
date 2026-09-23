import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUserId: vi.fn(), syncUserProfile: vi.fn(), loadPaPage: vi.fn(), savePaScript: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/server/pa-scripts", () => ({ loadPaPage: mocks.loadPaPage, savePaScript: mocks.savePaScript }));
import { GET, PATCH, POST } from "@/app/api/announcements/pa/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUserId.mockResolvedValue("user");
  mocks.syncUserProfile.mockResolvedValue({ id: "user", email: "user@example.com" });
});

function request(input: unknown) {
  return new Request("http://test/api/announcements/pa", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  });
}

it("requires a signed-in user for reads and writes", async () => {
  mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
  expect((await GET()).status).toBe(401);
  expect((await PATCH(request({ date: "2026-09-14", content: "copy", version: 1 }))).status).toBe(401);
  expect(mocks.loadPaPage).not.toHaveBeenCalled();
  expect(mocks.savePaScript).not.toHaveBeenCalled();
});

it.each([
  { date: "2026-02-30", content: "copy", version: 1 },
  { date: "not-a-date", content: "copy", version: 1 },
  { date: "2026-09-14", content: "copy", version: -1 },
  { date: "2026-09-14", content: "copy" },
  { date: "2026-09-14", content: "a".repeat(100001), version: 1 }
])("rejects invalid saves at the boundary", async (input) => {
  expect((await PATCH(request(input))).status).toBe(400);
  expect(mocks.savePaScript).not.toHaveBeenCalled();
});

it("returns useful conflict guidance without claiming the draft was saved", async () => {
  mocks.savePaScript.mockRejectedValue(new Error("CONFLICT"));
  const response = await PATCH(request({ date: "2026-09-14", content: "copy", version: 1 }));
  expect(response.status).toBe(409);
  expect((await response.json()).error.message).toContain("Copy your edits");
});

it("returns full script names intact", async () => {
  const data = { date: "2026-09-14", dateLabel: "Monday", announcers: ["Alex Kim"], canEdit: true, script: { content: "I'm Alex Kim.", version: 1 } };
  mocks.loadPaPage.mockResolvedValue(data);
  expect(await (await GET()).json()).toEqual({ data });
});


it("validates regeneration requests and requires authentication", async () => {
  expect((await POST(request({ date: "bad", version: 1 }))).status).toBe(400);
  expect((await POST(request({ date: "2026-09-14" }))).status).toBe(400);
  mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
  expect((await POST(request({ date: "2026-09-14", version: 1 }))).status).toBe(401);
  expect(mocks.savePaScript).not.toHaveBeenCalled();
});

it("routes regeneration to the protected script writer", async () => {
  mocks.savePaScript.mockResolvedValue({ script: { content: "Fresh copy", version: 2 } });
  expect((await POST(request({ date: "2026-09-14", version: 1 }))).status).toBe(200);
  expect(mocks.savePaScript).toHaveBeenCalledWith({ userId: "user", email: "user@example.com" }, { date: "2026-09-14", version: 1, regenerate: true });
  mocks.savePaScript.mockRejectedValue(new Error("PA_REGENERATE_EMPTY"));
  const response = await POST(request({ date: "2026-09-14", version: 1 }));
  expect(response.status).toBe(503);
  expect((await response.json()).error.message).toContain("Your script has been kept");
});
