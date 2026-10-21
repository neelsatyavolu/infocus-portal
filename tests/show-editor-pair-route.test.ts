import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pairing: { findUnique: vi.fn(), updateMany: vi.fn() }
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorPairing: mocks.pairing } }));

import { GET, POST } from "@/app/api/service/show-editor/pair/[code]/route";
import middleware from "@/middleware";

// A stand-in for the Mac's base64 X25519 key.
const KEY = Buffer.from("test-public-key").toString("base64");
let address = 0;

/** No Authorization header at all: these routes are authorised by the code alone. */
function request(method: "GET" | "POST", body?: unknown) {
  address += 1;
  return new Request("https://portal.example.edu/api/service/show-editor/pair/ABCD-2345", {
    method,
    headers: { "content-type": "application/json", "cf-connecting-ip": `203.0.113.${address}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const params = (code = "ABCD-2345") => ({ params: Promise.resolve({ code }) });

describe("pairing routes (code-authorised)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SHOW_EDITOR_TOKEN", "editor-token-for-tests");
    mocks.pairing.updateMany.mockResolvedValue({ count: 1 });
  });

  it("GET works without the editor token and returns the key to seal to", async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    mocks.pairing.findUnique.mockResolvedValue({ backend: "claude", publicKey: KEY, expiresAt, submittedAt: null });
    const response = await GET(request("GET"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { backend: "claude", publicKey: KEY, expiresAt: expiresAt.toISOString() } });
    expect(mocks.pairing.findUnique).toHaveBeenCalledWith({ where: { codeHash: createHash("sha256").update("ABCD2345").digest("hex") } });
  });

  it("POST works without the editor token and spends the code", async () => {
    const response = await POST(request("POST", { ciphertext: "c2VhbGVkLWNyZWRlbnRpYWw=" }), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { ok: true } });
    expect(mocks.pairing.updateMany.mock.calls[0][0].data).toMatchObject({ ciphertext: "c2VhbGVkLWNyZWRlbnRpYWw=" });
  });

  it("404 for unknown, expired or already-submitted codes", async () => {
    mocks.pairing.findUnique.mockResolvedValueOnce(null);
    expect((await GET(request("GET"), params())).status).toBe(404);
    mocks.pairing.findUnique.mockResolvedValueOnce({ backend: "claude", publicKey: KEY, expiresAt: new Date(Date.now() - 1000), submittedAt: null });
    expect((await GET(request("GET"), params())).status).toBe(404);
    mocks.pairing.findUnique.mockResolvedValueOnce({ backend: "claude", publicKey: KEY, expiresAt: new Date(Date.now() + 60_000), submittedAt: new Date() });
    expect((await GET(request("GET"), params())).status).toBe(404);
    mocks.pairing.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await POST(request("POST", { ciphertext: "c2VhbGVk" }), params())).status).toBe(404);
    expect((await GET(request("GET"), params("not-a-code"))).status).toBe(404);
  });

  it("caps ciphertext at 65536 characters", async () => {
    expect((await POST(request("POST", { ciphertext: "A".repeat(65_537) }), params())).status).toBe(400);
    expect((await POST(request("POST", {}), params())).status).toBe(400);
    expect(mocks.pairing.updateMany).not.toHaveBeenCalled();
    expect((await POST(request("POST", { ciphertext: "A".repeat(65_536) }), params())).status).toBe(200);
  });

  it("rate-limits one address", async () => {
    mocks.pairing.findUnique.mockResolvedValue(null);
    const make = () => new Request("https://portal.example.edu/api/service/show-editor/pair/ABCD-2345", {
      headers: { "cf-connecting-ip": "198.51.100.77" }
    });
    const statuses: number[] = [];
    for (let index = 0; index < 21; index += 1) statuses.push((await GET(make(), params())).status);
    expect(statuses.slice(0, 20).every((status) => status === 404)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("middleware lets a signed-out pair request through to the handler", async () => {
    const response = await middleware(new NextRequest("https://portal.example.edu/api/service/show-editor/pair/ABCD-2345"));
    expect(response.status).not.toBe(401);
    expect(response.headers.get("location")).toBeNull();
    const control = await middleware(new NextRequest("https://portal.example.edu/api/show-roles/edits?date=2026-10-21"));
    expect(control.status === 401 || control.headers.get("location") !== null).toBe(true);
  });
});
