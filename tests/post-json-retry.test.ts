import { afterEach, describe, expect, it, vi } from "vitest";
import { postJson } from "@/components/master-calendar/post-json";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
}

/** A fetch that never answers until its signal aborts (a request stuck at the edge). */
function stuckFetch(_url: RequestInfo | URL, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("postJson", () => {
  it("returns the first answer when it comes in time", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ content: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const { response, payload } = await postJson<{ content: string }>("/api/x", { a: 1 }, { retryAfterMs: 8000 });

    expect(response.ok).toBe(true);
    expect(payload.data?.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels a stuck request after the wait and sends it once more", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementationOnce(stuckFetch).mockImplementationOnce(async () => jsonResponse({ content: "saved" }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = postJson<{ content: string }>("/api/x", { a: 1 }, { retryAfterMs: 8000 });
    await vi.advanceTimersByTimeAsync(8000);
    const { payload } = await pending;

    expect(payload.data?.content).toBe("saved");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchMock.mock.calls[0];
    expect((firstInit as RequestInit).signal?.aborted).toBe(true);
    const [, secondInit] = fetchMock.mock.calls[1];
    expect((secondInit as RequestInit).body).toBe(JSON.stringify({ a: 1 }));
  });

  it("does not retry an answer from the server, even an error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, 500));
    vi.stubGlobal("fetch", fetchMock);

    const { response } = await postJson("/api/x", {}, { retryAfterMs: 8000 });

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after a network failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(async () => jsonResponse({ content: "saved" }));
    vi.stubGlobal("fetch", fetchMock);

    const { payload } = await postJson<{ content: string }>("/api/x", {}, { retryAfterMs: 8000 });

    expect(payload.data?.content).toBe("saved");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second try fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postJson("/api/x", {}, { retryAfterMs: 8000 })).rejects.toThrow("Failed to fetch");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never times out or retries without retryAfterMs (slow work like the Google Doc sync)", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);

    const pending = postJson<{ synced: boolean }>("/api/sync", {});
    await vi.advanceTimersByTimeAsync(60_000);
    resolve(jsonResponse({ synced: true }));
    const { payload } = await pending;

    expect(payload.data?.synced).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
