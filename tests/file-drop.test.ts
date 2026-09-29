import { describe, expect, it } from "vitest";
import { hasDraggedFiles, splitDroppedFiles } from "@/src/lib/file-drop";

function file(name: string, type: string) {
  return new File(["x"], name, { type });
}

describe("hasDraggedFiles", () => {
  it("is true only when the drag carries files", () => {
    expect(hasDraggedFiles(["Files"])).toBe(true);
    expect(hasDraggedFiles(["text/plain", "Files"])).toBe(true);
    expect(hasDraggedFiles(["text/plain", "text/uri-list"])).toBe(false);
    expect(hasDraggedFiles([])).toBe(false);
  });
});

describe("splitDroppedFiles", () => {
  it("keeps videos for video/*", () => {
    const mp4 = file("C1549.MP4", "video/mp4");
    const mov = file("interview.mov", "video/quicktime");
    const png = file("still.png", "image/png");
    const unknown = file("clip.braw", "");
    expect(splitDroppedFiles([mp4, png, mov, unknown], "video/*")).toEqual({
      accepted: [mp4, mov],
      rejected: [png, unknown]
    });
  });

  it("keeps images for image/*", () => {
    const heic = file("proof.HEIC", "image/heic");
    const pdf = file("proof.pdf", "application/pdf");
    expect(splitDroppedFiles([heic, pdf], "image/*")).toEqual({ accepted: [heic], rejected: [pdf] });
  });

  it("matches exact types and extensions in a comma list", () => {
    const pdf = file("notes.pdf", "application/pdf");
    const mov = file("B-ROLL.MOV", "");
    const txt = file("notes.txt", "text/plain");
    expect(splitDroppedFiles([pdf, mov, txt], "application/pdf, .mov")).toEqual({
      accepted: [pdf, mov],
      rejected: [txt]
    });
  });

  it("accepts everything when accept is empty", () => {
    const txt = file("notes.txt", "text/plain");
    expect(splitDroppedFiles([txt], "")).toEqual({ accepted: [txt], rejected: [] });
  });
});
