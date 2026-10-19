import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAppReviewPathAllowed } from "@/src/lib/app-review";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  batch: vi.fn(),
  dates: vi.fn()
}));

vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/src/server/ideas", () => ({ getIdeaBatch: mocks.batch, listIdeaRunDates: mocks.dates }));

import { GET } from "@/app/api/ideas/route";

const idea = {
  title: "Library hours",
  pitch: "The library is open later.",
  angle: "What students do after school",
  category: "news",
  sources: [{ title: "Hours change", outlet: "Example News", url: "https://example.com/a" }]
};
const batch = { runDate: "2026-10-18", itemCount: 30, ideas: [idea] };

function request(query = "") {
  return new Request(`https://portal.example.edu/api/ideas${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.batch.mockResolvedValue(batch);
  mocks.dates.mockResolvedValue(["2026-10-18", "2026-10-16"]);
});

describe("GET /api/ideas", () => {
  it("returns the newest set and the run dates", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ batch, runDates: ["2026-10-18", "2026-10-16"] });
    expect(mocks.batch).toHaveBeenCalledWith(undefined);
  });

  it("passes a requested date through", async () => {
    await GET(request("?date=2026-10-16"));
    expect(mocks.batch).toHaveBeenCalledWith("2026-10-16");
  });

  it("returns a null batch when no set exists for the date", async () => {
    mocks.batch.mockResolvedValue(null);
    const body = await (await GET(request("?date=2026-01-01"))).json();
    expect(body.data.batch).toBeNull();
  });

  it("rejects a malformed date", async () => {
    const response = await GET(request("?date=yesterday"));
    expect(response.status).toBe(400);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("stays closed to the App Review account", () => {
    expect(isAppReviewPathAllowed("/api/ideas")).toBe(false);
  });
});
