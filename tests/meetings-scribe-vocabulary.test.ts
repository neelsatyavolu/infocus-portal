import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  users: [] as Array<{ id: string; name: string | null; nickname: string | null }>,
  producers: [] as string[]
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: { user: { findMany: vi.fn(async () => mocks.users) } } }));
vi.mock("@/src/server/meetings-people", () => ({ producerUserIds: vi.fn(async () => mocks.producers) }));

import { MAX_SCRIBE_VOCABULARY, scribeVocabulary } from "@/src/server/meetings-scribe-vocabulary";

beforeEach(() => {
  mocks.users = [
    { id: "u-abby", name: "Abby Example", nickname: null },
    { id: "u-otto", name: "Otto  Example", nickname: "Otto" },
    { id: "u-sage", name: "Sage Example", nickname: "sage example" },
    { id: "u-none", name: null, nickname: " " }
  ];
  mocks.producers = ["u-sage"];
});

describe("scribeVocabulary", () => {
  it("lists producers first, then everyone, nickname before full name, without repeats or blanks", async () => {
    expect(await scribeVocabulary()).toEqual(["sage example", "Abby Example", "Otto", "Otto Example"]);
  });

  it("caps the list and each name's length", async () => {
    mocks.users = Array.from({ length: 400 }, (_, i) => ({ id: `u${i}`, name: `Student${i} ${"x".repeat(100)}`, nickname: null }));
    const words = await scribeVocabulary();
    expect(words).toHaveLength(MAX_SCRIBE_VOCABULARY);
    expect(Math.max(...words.map((w) => w.length))).toBe(80);
  });
});
