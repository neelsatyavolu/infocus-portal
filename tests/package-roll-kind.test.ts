import { describe, expect, it } from "vitest";
import { rollUploadSizeError } from "@/src/lib/package-roll-kind";

describe("roll upload limits", () => {
  it.each([ ["a-roll", 30], ["b-roll", 15] ] as const)("allows %s up to %i GB", (kind, gb) => {
    expect(rollUploadSizeError(kind, gb * 1024 ** 3)).toBeNull();
    expect(rollUploadSizeError(kind, gb * 1024 ** 3 + 1)).toContain(`${gb} GB`);
  });
});
