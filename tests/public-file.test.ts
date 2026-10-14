import { describe, expect, it } from "vitest";
import { readPublicFile } from "@/src/server/public-file";

describe("readPublicFile", () => {
  it("reads a file under public/", async () => {
    const file = await readPublicFile("live/infocus-icon.png");
    expect(file.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("rejects paths that leave public/", async () => {
    await expect(readPublicFile("../package.json")).rejects.toThrow("Invalid public file path");
    await expect(readPublicFile("/etc/hosts")).rejects.toThrow("Invalid public file path");
  });
});
