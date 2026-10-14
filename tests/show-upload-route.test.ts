import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ due: vi.fn(), run: vi.fn(), enqueue: vi.fn() }));

vi.mock("@/src/server/show-publishing-worker", () => ({ dueShowPublicationIds: mocks.due, runShowPublication: mocks.run }));
vi.mock("@/src/server/show-upload-queue", () => ({ enqueueShowUploads: mocks.enqueue }));

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
    expect((await call({}, "wrong")).status).toBe(401);
    expect(mocks.due).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("queues idle active shows when called by the cron", async () => {
    mocks.due.mockResolvedValue(["a", "b"]);
    const response = await call({});
    expect(response.status).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledWith(["a", "b"]);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs one show when called by the queue consumer", async () => {
    mocks.run.mockResolvedValue({ steps: 3 });
    expect((await call({ id: "pub" })).status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith("pub");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
