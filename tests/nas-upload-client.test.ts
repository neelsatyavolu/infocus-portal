import { describe, expect, it } from "vitest";
import { nasChunkSize, nasServiceUrl, nasShouldChunk, NAS_CHUNK_SIZE, NAS_CHUNK_THRESHOLD } from "@/src/lib/nas-upload-client";

describe("NAS upload client", () => {
  it("builds service chunk URLs from the minted upload URL", () => {
    const base = "https://drive.infocusportal.com/api/service/upload";
    expect(nasServiceUrl(base, "init")).toBe("https://drive.infocusportal.com/api/service/upload/init");
    expect(nasServiceUrl(base, "chunk", { upload_id: "abc", index: "2", token: "tok" })).toBe(
      "https://drive.infocusportal.com/api/service/upload/chunk?upload_id=abc&index=2&token=tok"
    );
    expect(nasServiceUrl(base, "complete")).toBe("https://drive.infocusportal.com/api/service/upload/complete");
  });

  it("chunks files at 8 MiB and above", () => {
    expect(nasShouldChunk(NAS_CHUNK_THRESHOLD - 1)).toBe(false);
    expect(nasShouldChunk(NAS_CHUNK_THRESHOLD)).toBe(true);
  });

  it("splits a file over all eight streams, in whole MiB up to Drive's 32 MiB cap", () => {
    const mib = 1024 * 1024;
    expect(nasChunkSize(8 * mib)).toBe(mib);
    expect(nasChunkSize(40 * mib)).toBe(5 * mib);
    expect(nasChunkSize(41 * mib)).toBe(6 * mib);
    expect(nasChunkSize(30 * 1024 * mib)).toBe(NAS_CHUNK_SIZE);
    expect(NAS_CHUNK_SIZE).toBe(32 * mib);
  });
});
