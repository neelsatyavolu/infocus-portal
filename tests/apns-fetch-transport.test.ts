import { describe, expect, it, vi } from "vitest";
import { sendOneWithFetch } from "@/src/lib/apns";

const HOST = "https://api.push.apple.com";
const device = { token: "abc123", environment: "production" as const, topic: "edu.example.app" };
const headers = { authorization: "bearer t", "apns-push-type": "alert" };

describe("sendOneWithFetch (APNs transport on Cloudflare Workers)", () => {
  it("posts to the device path with the topic header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await sendOneWithFetch(HOST, device, headers, "{}", fetchImpl);
    expect(result).toEqual({ token: "abc123", ok: true, dead: false, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.push.apple.com/3/device/abc123");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers).toMatchObject({ ...headers, "apns-topic": "edu.example.app" });
  });

  it("marks an unregistered token as dead", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reason: "Unregistered" }), { status: 410 }));
    const result = await sendOneWithFetch(HOST, device, headers, "{}", fetchImpl);
    expect(result).toEqual({ token: "abc123", ok: false, dead: true, status: 410, reason: "Unregistered" });
  });

  it("keeps a token that failed for another reason, even with an unreadable body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 503 }));
    const result = await sendOneWithFetch(HOST, device, headers, "{}", fetchImpl);
    expect(result).toEqual({ token: "abc123", ok: false, dead: false, status: 503, reason: undefined });
  });

  it("reports a network failure without throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connect failed"));
    const result = await sendOneWithFetch(HOST, device, headers, "{}", fetchImpl);
    expect(result).toEqual({ token: "abc123", ok: false, dead: false, reason: "connect failed" });
  });
});
