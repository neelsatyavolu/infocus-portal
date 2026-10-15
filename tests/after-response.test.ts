import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => ({ after: m.after }));

import { afterResponse } from "@/src/lib/after-response";

describe("afterResponse", () => {
  beforeEach(() => {
    m.after.mockReset();
  });

  it("hands the task to after() instead of running it in the request", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    afterResponse("notify", task);
    expect(task).not.toHaveBeenCalled();
    expect(m.after).toHaveBeenCalledTimes(1);
    await m.after.mock.calls[0][0]();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("logs a failure instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    afterResponse("notify", () => Promise.reject(new Error("smtp down")));
    await expect(m.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("notify failed", expect.any(Error));
    error.mockRestore();
  });

  it("still runs the task outside a request scope", async () => {
    m.after.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    const task = vi.fn().mockResolvedValue(undefined);
    afterResponse("notify", task);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
