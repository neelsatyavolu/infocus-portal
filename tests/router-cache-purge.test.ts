import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { isPortalWrite } from "@/components/shell/use-router-cache-purge";

const ORIGIN = "https://infocusportal.com";

describe("isPortalWrite", () => {
  it("counts same-origin API writes", () => {
    expect(isPortalWrite("/api/package-progress", { method: "PATCH" }, ORIGIN)).toBe(true);
    expect(isPortalWrite("/api/groups/abc/approve", { method: "post" }, ORIGIN)).toBe(true);
    expect(isPortalWrite(new URL("/api/members/1", ORIGIN), { method: "DELETE" }, ORIGIN)).toBe(true);
    expect(isPortalWrite(new Request(`${ORIGIN}/api/ideas`, { method: "PUT" }), undefined, ORIGIN)).toBe(true);
  });

  it("ignores reads", () => {
    expect(isPortalWrite("/api/package-progress", undefined, ORIGIN)).toBe(false);
    expect(isPortalWrite("/api/package-progress", { method: "GET" }, ORIGIN)).toBe(false);
    expect(isPortalWrite(new Request(`${ORIGIN}/api/ideas`), undefined, ORIGIN)).toBe(false);
  });

  it("ignores other origins and non-API paths", () => {
    expect(isPortalWrite("https://drive.infocusportal.com/upload", { method: "POST" }, ORIGIN)).toBe(false);
    expect(isPortalWrite("/groups", { method: "POST" }, ORIGIN)).toBe(false);
    expect(isPortalWrite("/apix/thing", { method: "POST" }, ORIGIN)).toBe(false);
  });

  it("ignores background writes", () => {
    expect(isPortalWrite("/api/slack/sync", { method: "POST" }, ORIGIN)).toBe(false);
    expect(isPortalWrite("/api/assistant/chat", { method: "POST" }, ORIGIN)).toBe(false);
    expect(isPortalWrite("/api/hub-chat", { method: "POST" }, ORIGIN)).toBe(false);
    expect(isPortalWrite("/api/meetings/abc/heartbeat", { method: "POST" }, ORIGIN)).toBe(false);
    expect(isPortalWrite("/api/nav/status", { method: "POST" }, ORIGIN)).toBe(false);
  });
});
