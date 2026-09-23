import { describe, expect, it } from "vitest";
import {
  isCachedStorageEstimated,
  selectBackgroundStorageRefreshIds,
  sumCachedStorageBytes
} from "@/src/server/platform-stats";

describe("platform admin stats storage", () => {
  it("sums cached project bytes without a live storage sync", () => {
    expect(
      sumCachedStorageBytes([
        { storageBytes: 100n },
        { storageBytes: 50n },
        { storageBytes: null }
      ])
    ).toBe(150);
  });

  it("marks storage as estimated when any project has never synced", () => {
    expect(
      isCachedStorageEstimated([{ storageUpdatedAt: new Date() }, { storageUpdatedAt: null }])
    ).toBe(true);
    expect(isCachedStorageEstimated([{ storageUpdatedAt: new Date() }])).toBe(false);
  });

  it("queues never-synced and zero-byte-with-media projects for background refresh only", () => {
    const ids = selectBackgroundStorageRefreshIds(
      [
        {
          id: "fresh",
          storageBytes: 12n,
          storageUpdatedAt: new Date(),
          mediaItemCount: 2
        },
        {
          id: "never",
          storageBytes: null,
          storageUpdatedAt: null,
          mediaItemCount: 0
        },
        {
          id: "zero-with-media",
          storageBytes: 0n,
          storageUpdatedAt: new Date(),
          mediaItemCount: 3
        }
      ],
      { limit: 10 }
    );

    expect(ids).toEqual(["never", "zero-with-media"]);
  });
});
