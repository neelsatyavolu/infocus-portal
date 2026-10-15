import { describe, expect, it } from "vitest";
import { cachedValue, rememberValue, setClientCacheOwner } from "@/src/lib/client-cache";

describe("client cache", () => {
  it("returns what was remembered", () => {
    setClientCacheOwner("abby@example.edu");
    rememberValue("stage:a-roll", { ok: 1 });
    expect(cachedValue("stage:a-roll")).toEqual({ ok: 1 });
  });

  it("forgets everything when the signed-in person changes", () => {
    setClientCacheOwner("abby@example.edu");
    rememberValue("stage:a-roll", { ok: 1 });
    expect(setClientCacheOwner("otto@example.edu")).toBe(true);
    expect(cachedValue("stage:a-roll")).toBeUndefined();
    expect(setClientCacheOwner("otto@example.edu")).toBe(false);
  });

  it("keeps at most 40 entries, dropping the oldest", () => {
    setClientCacheOwner("sage@example.edu");
    for (let index = 0; index < 45; index += 1) rememberValue(`key-${index}`, index);
    expect(cachedValue("key-0")).toBeUndefined();
    expect(cachedValue("key-44")).toBe(44);
  });
});
