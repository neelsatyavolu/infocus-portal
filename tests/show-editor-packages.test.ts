import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorDevice: {
  findFirst: async () => null,
  upsert: async () => ({ id: "legacy", revokedAt: null })
} } }));

import { POST } from "@/app/api/service/show-editor/packages/route";
import { PACKAGE_ZIPS_FOLDER, packageZips } from "@/src/server/show-editor-packages";

function item(name: string, extra: Record<string, unknown> = {}) {
  return { name, path: `${PACKAGE_ZIPS_FOLDER}/${name}`, isDir: false, size: 100, mtime: "2026-11-13T19:00:00+00:00", ...extra };
}

describe("packageZips", () => {
  it("lists the package zips with their theme and a download link", async () => {
    const list = vi.fn(async () => [
      item("InFocus 2026 Package.zip"),
      item("InFocus Christmas 2026 Package.zip", { size: 321 }),
      item("InFocus Thanksgiving 2026 Package.zip"),
      item("notes.txt"),
      item("InFocus Old 2025 Package.zip", { isDir: true }),
      item("InFocus Spooky Night 2026 Package.zip")
    ]);
    const mint = vi.fn(async (path: string) => `https://drive.example/dl?p=${encodeURIComponent(path)}`);
    const { zips } = await packageZips({ list, mint });
    expect(list).toHaveBeenCalledWith(PACKAGE_ZIPS_FOLDER);
    expect(zips.map((z) => z.theme)).toEqual(["", "christmas", "thanksgiving"]);
    expect(zips[1]).toEqual({
      theme: "christmas",
      name: "InFocus Christmas 2026 Package.zip",
      size: 321,
      modifiedAt: "2026-11-13T19:00:00+00:00",
      url: `https://drive.example/dl?p=${encodeURIComponent(`${PACKAGE_ZIPS_FOLDER}/InFocus Christmas 2026 Package.zip`)}`
    });
  });

  it("keeps only the newest year of each theme", async () => {
    const list = async () => [item("InFocus Christmas 2026 Package.zip"), item("InFocus Christmas 2027 Package.zip")];
    const { zips } = await packageZips({ list, mint: async (p: string) => p });
    expect(zips.map((z) => z.name)).toEqual(["InFocus Christmas 2027 Package.zip"]);
  });
});

describe("POST /api/service/show-editor/packages", () => {
  it("needs a linked editing Mac", async () => {
    const res = await POST(new Request("https://portal.example/api/service/show-editor/packages", { method: "POST" }));
    expect(res.status).toBe(401);
  });
});
