import { describe, expect, it } from "vitest";
import { nasServiceUrl, nasShouldChunk, NAS_CHUNK_THRESHOLD } from "@/src/lib/nas-upload-client";

describe("NAS upload client", () => {
  it("builds service chunk URLs from the minted upload URL", () => {
    const base = "https://drive.infocuspaly.com/api/service/upload";
    expect(nasServiceUrl(base, "init")).toBe("https://drive.infocuspaly.com/api/service/upload/init");
    expect(nasServiceUrl(base, "chunk", { upload_id: "abc", index: "2", token: "tok" })).toBe(
      "https://drive.infocuspaly.com/api/service/upload/chunk?upload_id=abc&index=2&token=tok"
    );
    expect(nasServiceUrl(base, "complete")).toBe("https://drive.infocuspaly.com/api/service/upload/complete");
  });

  it("chunks files at 8 MiB and above", () => {
    expect(nasShouldChunk(NAS_CHUNK_THRESHOLD - 1)).toBe(false);
    expect(nasShouldChunk(NAS_CHUNK_THRESHOLD)).toBe(true);
  });
});
