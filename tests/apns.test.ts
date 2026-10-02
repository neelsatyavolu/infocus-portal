import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Reply = { status: number; body?: string };
const http = vi.hoisted(() => ({
  connect: vi.fn(),
  replies: new Map<string, { status: number; body?: string }>(),
  requests: [] as { host: string; headers: Record<string, unknown>; body: string }[]
}));

vi.mock("node:http2", () => ({
  default: { connect: http.connect, constants: { NGHTTP2_CANCEL: 8 } }
}));

import {
  apnsTopic,
  buildApnsPayload,
  buildProviderToken,
  isApnsConfigured,
  resetApnsProviderTokenCache,
  sendApns
} from "@/src/lib/apns";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);

function fakeSession(host: string) {
  const session = new EventEmitter() as EventEmitter & { request: unknown; close: () => void };
  session.close = vi.fn();
  session.request = (headers: Record<string, unknown>) => {
    const stream = new EventEmitter() as EventEmitter & Record<string, unknown>;
    stream.setTimeout = vi.fn();
    stream.setEncoding = vi.fn();
    stream.close = vi.fn();
    stream.end = (body: string) => {
      http.requests.push({ host, headers, body });
      const token = String(headers[":path"]).split("/").pop() ?? "";
      const reply: Reply = http.replies.get(token) ?? { status: 200 };
      queueMicrotask(() => {
        stream.emit("response", { ":status": reply.status });
        if (reply.body) stream.emit("data", reply.body);
        stream.emit("end");
      });
    };
    return stream;
  };
  return session;
}

beforeEach(() => {
  vi.stubEnv("APNS_KEY_ID", "KEY123");
  vi.stubEnv("APNS_TEAM_ID", "TEAM123");
  vi.stubEnv("APNS_PRIVATE_KEY", pem.replace(/\n/g, "\\n"));
  vi.stubEnv("APNS_TOPIC", "com.example.infocus");
  http.replies.clear();
  http.requests.length = 0;
  http.connect.mockImplementation((host: string) => fakeSession(host));
  resetApnsProviderTokenCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("APNs provider token", () => {
  it("is an ES256 JWT with the key id and team, verifiable with the public key", () => {
    const jwt = buildProviderToken({ keyId: "KEY123", teamId: "TEAM123", privateKey: pem }, 1_700_000_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({ iss: "TEAM123", iat: 1_700_000_000 });
    const valid = crypto.verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature!, "base64url")
    );
    expect(valid).toBe(true);
  });
});

describe("APNs payload and config", () => {
  it("builds an alert with sound, optional thread and click URL", () => {
    expect(JSON.parse(buildApnsPayload({ title: "T", body: "B", url: "https://portal.example.edu/groups", threadId: "/groups" }))).toEqual({
      aps: { alert: { title: "T", body: "B" }, sound: "default", "thread-id": "/groups" },
      url: "https://portal.example.edu/groups"
    });
    expect(JSON.parse(buildApnsPayload({ title: "T", body: "B" }))).toEqual({
      aps: { alert: { title: "T", body: "B" }, sound: "default" }
    });
  });

  it("adds the app's custom keys", () => {
    expect(JSON.parse(buildApnsPayload({ title: "T", body: "B", data: { kind: "show", videoId: "abc" } }))).toMatchObject({
      kind: "show",
      videoId: "abc"
    });
  });

  it("is off without the signing key or any app topic", async () => {
    expect(isApnsConfigured()).toBe(true);
    expect(apnsTopic("macos")).toBe("com.example.infocus");
    expect(apnsTopic("ios")).toBeNull();
    vi.stubEnv("APNS_TOPIC", "");
    expect(isApnsConfigured()).toBe(false);
    vi.stubEnv("APNS_NEWS_TOPIC", "com.example.news");
    expect(isApnsConfigured()).toBe(true);
    vi.stubEnv("APNS_KEY_ID", "");
    expect(isApnsConfigured()).toBe(false);
    expect(await sendApns([{ token: tokenA, environment: "production", topic: "com.example.infocus" }], { title: "T", body: "B" })).toEqual([]);
    expect(http.connect).not.toHaveBeenCalled();
  });
});

describe("sendApns", () => {
  it("posts to the right host with token auth headers", async () => {
    const results = await sendApns(
      [{ token: tokenA, environment: "production", topic: "com.example.infocus" }, { token: tokenB, environment: "development", topic: "com.example.infocus" }],
      { title: "T", body: "B" }
    );
    expect(results).toEqual([
      { token: tokenA, ok: true, dead: false, status: 200 },
      { token: tokenB, ok: true, dead: false, status: 200 }
    ]);
    expect(http.connect).toHaveBeenCalledWith("https://api.push.apple.com");
    expect(http.connect).toHaveBeenCalledWith("https://api.sandbox.push.apple.com");
    const prod = http.requests.find((request) => request.host === "https://api.push.apple.com");
    expect(prod?.headers).toMatchObject({
      ":method": "POST",
      ":path": `/3/device/${tokenA}`,
      "apns-topic": "com.example.infocus",
      "apns-push-type": "alert",
      authorization: expect.stringMatching(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/)
    });
    expect(JSON.parse(prod!.body).aps.alert).toEqual({ title: "T", body: "B" });
  });

  it("addresses each device to its own app", async () => {
    await sendApns(
      [{ token: tokenA, environment: "production", topic: "com.example.mac" }, { token: tokenB, environment: "production", topic: "com.example.phone" }],
      { title: "T", body: "B" }
    );
    expect(http.requests.map((request) => request.headers["apns-topic"])).toEqual(["com.example.mac", "com.example.phone"]);
  });

  it("marks tokens Apple says are gone as dead, but not other failures", async () => {
    http.replies.set(tokenA, { status: 410, body: JSON.stringify({ reason: "Unregistered" }) });
    http.replies.set(tokenB, { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) });
    const tokenC = "c".repeat(64);
    http.replies.set(tokenC, { status: 500, body: JSON.stringify({ reason: "InternalServerError" }) });
    const results = await sendApns(
      [tokenA, tokenB, tokenC].map((token) => ({ token, environment: "production" as const, topic: "com.example.infocus" })),
      { title: "T", body: "B" }
    );
    expect(results.map((result) => [result.dead, result.reason])).toEqual([
      [true, "Unregistered"],
      [true, "BadDeviceToken"],
      [false, "InternalServerError"]
    ]);
  });

  it("reuses the provider token, and drops it when Apple rejects it as expired", async () => {
    await sendApns([{ token: tokenA, environment: "production", topic: "com.example.infocus" }], { title: "T", body: "B" });
    await sendApns([{ token: tokenA, environment: "production", topic: "com.example.infocus" }], { title: "T", body: "B" });
    const [first, second] = http.requests.map((request) => request.headers.authorization);
    expect(second).toBe(first);

    http.replies.set(tokenA, { status: 403, body: JSON.stringify({ reason: "ExpiredProviderToken" }) });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 1000);
    await sendApns([{ token: tokenA, environment: "production", topic: "com.example.infocus" }], { title: "T", body: "B" });
    http.replies.delete(tokenA);
    await sendApns([{ token: tokenA, environment: "production", topic: "com.example.infocus" }], { title: "T", body: "B" });
    vi.useRealTimers();
    expect(http.requests[3]!.headers.authorization).not.toBe(first);
  });

  it("never throws when the connection fails", async () => {
    http.connect.mockImplementation(() => {
      throw new Error("connect failed");
    });
    expect(await sendApns([{ token: tokenA, environment: "production", topic: "com.example.infocus" }], { title: "T", body: "B" })).toEqual([
      { token: tokenA, ok: false, dead: false, reason: "connect failed" }
    ]);
  });
});
