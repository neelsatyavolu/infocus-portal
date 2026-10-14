import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("@/src/server/show-publishing-worker", () => ({ runShowPublication: mocks.run }));

import { POST } from "@/app/api/service/shows/upload/route";

function call(body: unknown, secret = "cron-secret") {
  return POST(new Request("https://portal.example/api/service/shows/upload", {
    method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(body)
  }));
}

describe("POST /api/service/shows/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses callers without the cron secret", async () => {
    expect((await call({ id: "pub" }, "wrong")).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("requires a show id", async () => {
    expect((await call({})).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs one show and says when to run it again", async () => {
    mocks.run.mockResolvedValue({ steps: 3, nextInSeconds: 60 });
    const response = await call({ id: "pub" });
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith("pub");
    expect((await response.json()).data).toEqual({ steps: 3, nextInSeconds: 60 });
  });
});
