import { describe, expect, it } from "vitest";
import {
  nasDeriveThumbnailUrl,
  nasDeriveWebPlaybackUrl,
  nasPosterPath
} from "@/src/lib/nas-storage";

const FILE_URL =
  "https://drive.infocuspaly.com/api/service/file?path=Package%20Storage%2FCycle%201%2Fclip.mov&token=abc";

describe("NAS Drive URL helpers", () => {
  it("keeps poster.jpg beside the video for client-captured frames", () => {
    expect(nasPosterPath("Package Storage/Cycle 1/Group/A-roll/JeffDay.mov")).toBe(
      "Package Storage/Cycle 1/Group/A-roll/JeffDay.poster.jpg"
    );
  });

  it("derives a Drive ffmpeg thumbnail URL from a minted file download URL", () => {
    const url = new URL(nasDeriveThumbnailUrl(FILE_URL));
    expect(url.pathname).toBe("/api/service/thumbnail");
    expect(url.searchParams.get("path")).toBe("Package Storage/Cycle 1/clip.mov");
    expect(url.searchParams.get("token")).toBe("abc");
    expect(url.searchParams.get("size")).toBe("512");
  });

  it("marks browser playback with web=1 so Drive can transcode ProRes/XAVC", () => {
    const url = new URL(nasDeriveWebPlaybackUrl(FILE_URL));
    expect(url.pathname).toBe("/api/service/file");
    expect(url.searchParams.get("web")).toBe("1");
    expect(url.searchParams.get("token")).toBe("abc");
    expect(url.searchParams.get("path")).toBe("Package Storage/Cycle 1/clip.mov");
  });

  it("does not point thumbnails at a sidecar poster.jpg that may not exist", () => {
    expect(nasDeriveThumbnailUrl(FILE_URL)).not.toContain("poster.jpg");
  });
});
