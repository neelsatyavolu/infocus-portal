import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorDevice: {
  findFirst: async () => null,
  upsert: async () => ({ id: "legacy", revokedAt: null })
} } }));

import { POST } from "@/app/api/service/show-editor/intros/route";
import { latestIntros } from "@/src/server/show-editor-graphics";

const SHA = "e".repeat(40);
const ENV = { SHOW_EDITOR_GRAPHICS_TOKEN: "gh-token-for-tests" };
const RELEASE_URL = "https://api.github.com/repos/neelsatyavolu/infocus-graphics/releases/tags/intros";

describe("latestIntros", () => {
  it("returns the newest intros tarball from the intros release, ignoring other assets", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === RELEASE_URL) {
        return new Response(JSON.stringify({ assets: [
          { name: `intros-${SHA}.tar.gz`, url: "https://api.github.com/assets/1", size: 99, state: "uploaded", updated_at: "2026-11-17T00:00:00Z" },
          { name: `graphics-source-${"f".repeat(40)}.tar.gz`, url: "https://api.github.com/assets/2", size: 1, state: "uploaded", updated_at: "2026-11-18T00:00:00Z" }
        ] }), { status: 200 });
      }
      return new Response(null, { status: 302, headers: { location: "https://signed.example/intros" } });
    });
    expect(await latestIntros(fetchImpl as typeof fetch, ENV)).toEqual({ version: SHA, url: "https://signed.example/intros", size: 99, sha256: null });
  });

  it("gives a reason when the intros release isn't there yet", async () => {
    const missing = vi.fn(async () => new Response("{}", { status: 404 }));
    expect(await latestIntros(missing as typeof fetch, ENV)).toMatchObject({ version: null });
  });
});

describe("POST /api/service/show-editor/intros", () => {
  it("needs an editor token", async () => {
    const res = await POST(new Request("https://portal.example.edu/api/service/show-editor/intros", { method: "POST" }));
    expect(res.status).toBe(401);
  });
});
