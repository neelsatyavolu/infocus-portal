import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn(),
  mediaFindMany: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFindUnique },
    mediaItem: { findMany: mocks.mediaFindMany }
  }
}));

vi.mock("@/src/lib/bunny", () => ({
  createOriginalVideoDownloadToken: (videoId: string) => ({
    token: "stub-token",
    expiresAt: 0,
    downloadUrl: `https://stub.bunny/${videoId}`
  })
}));

import { buildProjectDownloadScript } from "@/src/server/project-download";

const updatedAt = new Date("2026-11-01T00:00:00.000Z");

function mediaItem(id: string, title: string, sourceType: "IMAGE" | "VIDEO", folder: string | null = null) {
  return {
    id,
    title,
    updatedAt,
    folder: folder ? { name: folder } : null,
    currentVersion: {
      id: `${id}-v1`,
      sourceType,
      status: "READY",
      bunnyVideoId: sourceType === "VIDEO" ? `${id}-bunny` : null,
      imageBase64: sourceType === "IMAGE" ? Buffer.from("png").toString("base64") : null,
      imageMimeType: sourceType === "IMAGE" ? "image/png" : null,
      updatedAt,
      storageSizeBytes: sourceType === "VIDEO" ? BigInt(1024) : null
    }
  };
}

describe("project download script quoting", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "infocus-script-"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("never runs commands taken from media titles, folder names or the project name", async () => {
    // Relative on purpose: "/" is stripped from titles, and the script runs in ~/Downloads.
    const marker = "PWNED";
    mocks.projectFindUnique.mockResolvedValue({ name: `Abby $(touch ${marker}-project)` });
    mocks.mediaFindMany.mockResolvedValue([
      mediaItem("img1", `Otto $(touch ${marker}-image)`, "IMAGE"),
      mediaItem("vid1", `Sage \`touch ${marker}-video\` ; echo hi`, "VIDEO", `B-roll $(touch ${marker}-folder)`),
      mediaItem("img2", "Abby's shot", "IMAGE")
    ]);

    const script = await buildProjectDownloadScript("project-1", "https://portal.example.edu");

    expect(script).not.toMatch(/^echo ".*\$\(/m);
    expect(script).not.toMatch(/^# Project:/m);

    // Stub out the network and zip so the generated script runs offline.
    const binDir = join(workDir, "bin");
    const home = join(workDir, "home");
    mkdirSync(binDir);
    mkdirSync(join(home, "Downloads"), { recursive: true });
    for (const tool of ["curl", "zip"]) {
      const path = join(binDir, tool);
      writeFileSync(path, "#!/bin/sh\nexit 0\n");
      chmodSync(path, 0o755);
    }
    const scriptPath = join(workDir, "download.sh");
    writeFileSync(scriptPath, script);

    const output = execFileSync("bash", [scriptPath], {
      cwd: workDir,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}`, HOME: home },
      encoding: "utf8"
    });

    for (const suffix of ["project", "image", "video", "folder"]) {
      expect(existsSync(join(home, "Downloads", `${marker}-${suffix}`))).toBe(false);
      expect(existsSync(join(workDir, `${marker}-${suffix}`))).toBe(false);
    }
    expect(output).toContain(`Saving image Otto $(touch ${marker}-image).png`);
    expect(output).toContain(`Starting download for B-roll $(touch ${marker}-folder)/Sage \`touch ${marker}-video\` ; echo hi.mp4`);
    expect(output).toContain("Saving image Abby's shot.png");
    expect(output).toContain(`Project: Abby $(touch ${marker}-project).zip`);
  });
});
