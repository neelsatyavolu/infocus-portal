import { describe, expect, it } from "vitest";
import { readLimitedBody } from "../src/body-limit";

function streamRequest(bytes: number, chunk = 1024): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const size = Math.min(chunk, bytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(97));
    }
  });
  return new Request("https://room.example.edu/x", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readLimitedBody", () => {
  it("rejects a declared Content-Length over the cap before reading", async () => {
    const request = new Request("https://room.example.edu/x", { method: "POST", headers: { "Content-Length": "999999" }, body: "{}" });
    expect(await readLimitedBody(request, 100)).toEqual({ ok: false, status: 413 });
  });

  it("stream-limits bodies without a Content-Length", async () => {
    expect(await readLimitedBody(streamRequest(5_000), 4_096)).toEqual({ ok: false, status: 413 });
    const ok = await readLimitedBody(streamRequest(4_096), 4_096);
    expect(ok.ok && ok.text.length).toBe(4_096);
  });

  it("returns an empty string for bodiless requests", async () => {
    expect(await readLimitedBody(new Request("https://room.example.edu/x"))).toEqual({ ok: true, text: "" });
  });
});
