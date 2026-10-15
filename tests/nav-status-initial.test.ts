import { describe, expect, it } from "vitest";
import { initialStatusResult } from "@/components/shell/use-nav-status";
import { EMPTY_NAV_STATUS, type NavStatusResponse } from "@/src/lib/sidebar-nav";

const data: NavStatusResponse = { ...EMPTY_NAV_STATUS, parts: ["package"], failed: [] };

/** Shaped like the thenable React hands a client component: then() returns nothing. */
function reactThenable<T>(settle: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void) {
  return {
    then(resolve: (value: T) => void, reject: (reason: unknown) => void) {
      settle(resolve, reject);
    }
  } as unknown as PromiseLike<T>;
}

describe("initialStatusResult", () => {
  it("adopts a React thenable whose then() returns nothing", async () => {
    await expect(initialStatusResult(reactThenable((resolve) => resolve(data)))).resolves.toEqual(data);
  });

  it("turns a failed or missing initial status into null instead of throwing", async () => {
    await expect(initialStatusResult(reactThenable((_resolve, reject) => reject(new Error("db"))))).resolves.toBeNull();
    await expect(initialStatusResult(undefined)).resolves.toBeNull();
    await expect(initialStatusResult(Promise.resolve(null))).resolves.toBeNull();
  });
});
