import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditJob: { findMany: mocks.findMany } } }));

import { cardsOf, PAST_CARDS_MAX, pastShowCards } from "@/src/server/show-editor-past-cards";

const card = (title: string) => ({ title, points: [`${title} point`], script: `${title} script.` });

describe("cardsOf", () => {
  it("reads checks.cards, trimming text", () => {
    expect(cardsOf({ coversClean: true, cards: [{ title: " Math Club ", points: [" Room 204 "], script: " Meets Tuesday. " }] }))
      .toEqual([{ title: "Math Club", points: ["Room 204"], script: "Meets Tuesday." }]);
  });

  it("is empty for checks without cards or with the wrong shape", () => {
    expect(cardsOf(null)).toEqual([]);
    expect(cardsOf([])).toEqual([]);
    expect(cardsOf({})).toEqual([]);
    expect(cardsOf({ cards: "Math Club" })).toEqual([]);
  });

  it("keeps strings only, drops cards without a title, and makes an empty script null", () => {
    expect(cardsOf({ cards: [
      null, "Math Club", { title: 7, points: [] }, { title: "  ", points: ["x"] },
      { title: "Art Show", points: ["Gallery", 3, null, "", "Friday"], script: 12 },
      { title: "Bake Sale", script: "" }
    ] })).toEqual([
      { title: "Art Show", points: ["Gallery", "Friday"], script: null },
      { title: "Bake Sale", points: [], script: null }
    ]);
  });

  it("caps lengths: title 120, 6 points of 160, script 1500", () => {
    const [read] = cardsOf({ cards: [{ title: "t".repeat(200), points: Array.from({ length: 9 }, () => "p".repeat(300)), script: "s".repeat(2000) }] });
    expect(read.title).toHaveLength(120);
    expect(read.points).toHaveLength(6);
    expect(read.points.every((point) => point.length === 160)).toBe(true);
    expect(read.script).toHaveLength(1500);
  });
});

describe("pastShowCards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it("asks for other shows' finished edits, newest show first, latest edit first within a show", async () => {
    await pastShowCards("2026-10-21");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ["REVIEW", "PUBLISHED"] }, showDate: { not: "2026-10-21" } },
      orderBy: [{ showDate: "desc" }, { createdAt: "desc" }],
      select: { showDate: true, checks: true }
    }));
  });

  it("takes one edit per show (the first, i.e. latest) and tags each card with its show", async () => {
    mocks.findMany.mockResolvedValue([
      { showDate: "2026-10-16", checks: { cards: [card("Math Club"), card("Art Show")] } },
      { showDate: "2026-10-16", checks: { cards: [card("Older version")] } },
      { showDate: "2026-10-14", checks: { coversClean: true } },
      { showDate: "2026-10-09", checks: { cards: [card("Bake Sale")] } }
    ]);
    expect(await pastShowCards("2026-10-21")).toEqual([
      { showDate: "2026-10-16", ...card("Math Club") },
      { showDate: "2026-10-16", ...card("Art Show") },
      { showDate: "2026-10-09", ...card("Bake Sale") }
    ]);
  });

  it("stops at 16 cards", async () => {
    mocks.findMany.mockResolvedValue(["2026-10-16", "2026-10-14", "2026-10-09"].map((showDate) => ({
      showDate, checks: { cards: Array.from({ length: 7 }, (_, index) => card(`${showDate} #${index}`)) }
    })));
    const cards = await pastShowCards("2026-10-21");
    expect(cards).toHaveLength(PAST_CARDS_MAX);
    expect(cards.at(-1)).toMatchObject({ showDate: "2026-10-09", title: "2026-10-09 #1" });
  });
});
