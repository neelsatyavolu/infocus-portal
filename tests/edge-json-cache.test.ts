import { describe, expect, it } from "vitest";
import { readEdgeJson, writeEdgeJson, type EdgeCache } from "@/src/server/edge-json-cache";

function memoryCache() {
  const store = new Map<string, Response>();
  const cache: EdgeCache = {
    match: async (key) => store.get(key.url)?.clone(),
    put: async (key, response) => {
      store.set(key.url, response);
    }
  };
  return { cache, store };
}

describe("edge JSON cache", () => {
  it("reads back what it wrote, with the given lifetime", async () => {
    const { cache, store } = memoryCache();
    await writeEdgeJson("slack-announcements", { at: 1, items: ["a"] }, 20, cache);
    expect(await readEdgeJson("slack-announcements", cache)).toEqual({ at: 1, items: ["a"] });
    const [stored] = [...store.values()];
    expect(stored?.headers.get("Cache-Control")).toBe("public, max-age=20");
  });

  it("misses cleanly: nothing stored, no cache off Workers, or a broken cache", async () => {
    expect(await readEdgeJson("nothing", memoryCache().cache)).toBeNull();
    expect(await readEdgeJson("nothing", null)).toBeNull();
    await expect(writeEdgeJson("x", 1, 20, null)).resolves.toBeUndefined();
    const broken: EdgeCache = {
      match: async () => {
        throw new Error("cache down");
      },
      put: async () => {
        throw new Error("cache down");
      }
    };
    expect(await readEdgeJson("x", broken)).toBeNull();
    await expect(writeEdgeJson("x", 1, 20, broken)).resolves.toBeUndefined();
  });
});
