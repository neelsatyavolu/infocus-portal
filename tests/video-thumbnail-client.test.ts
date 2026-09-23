import { describe, expect, it } from "vitest";
import { canCaptureClientPoster } from "@/src/lib/video-thumbnail-client";

describe("client poster capture", () => {
  it("skips decode in a background tab so the next clip can upload", () => {
    expect(canCaptureClientPoster("visible")).toBe(true);
    expect(canCaptureClientPoster("hidden")).toBe(false);
  });
});
