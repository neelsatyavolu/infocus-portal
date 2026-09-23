import { describe, expect, it } from "vitest";
import { shouldQueryBunnyStorage } from "@/src/server/storage-cache";

describe("shouldQueryBunnyStorage", () => {
  it("does not call Bunny for NAS / Drive versions", () => {
    expect(
      shouldQueryBunnyStorage({
        storageProvider: "NAS",
        bunnyVideoId: "nas_abc123"
      })
    ).toBe(false);
    expect(
      shouldQueryBunnyStorage({
        storageProvider: "BUNNY",
        bunnyVideoId: "nas:legacy"
      })
    ).toBe(false);
  });

  it("still queries Bunny for Stream versions", () => {
    expect(
      shouldQueryBunnyStorage({
        storageProvider: "BUNNY",
        bunnyVideoId: "8f3c0a1b-stream-guid"
      })
    ).toBe(true);
  });
});
