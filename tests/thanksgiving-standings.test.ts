import { describe, expect, it } from "vitest";
import { EMPTY_HARVEST, HARVEST_CONTEST, rankBoard, type BoardEntry } from "@/src/lib/thanksgiving-board";
import { formatCountdown, inFinalHour, rankMove, viewerGapLine } from "@/src/lib/thanksgiving-standings";

function board(...entries: Array<[string, number, number?]>) {
  return rankBoard(
    entries.map(([name, leaves, pardons = 0]): BoardEntry => ({ ...EMPTY_HARVEST, bonus: 0, userId: name, name, leaves, pardons }))
  );
}

describe("rankMove", () => {
  it("is places climbed since yesterday, negative for a fall, new for a newcomer", () => {
    expect(rankMove(1, 4)).toBe(3);
    expect(rankMove(5, 4)).toBe(-1);
    expect(rankMove(2, 2)).toBe(0);
    expect(rankMove(3, undefined)).toBe("new");
  });
});

describe("viewerGapLine", () => {
  it("says how far behind first the viewer is", () => {
    expect(viewerGapLine(board(["Abby", 40], ["Otto", 28]), "Otto")).toBe("You're 12 points behind Abby for first.");
    expect(viewerGapLine(board(["Abby", 2], ["Otto", 1]), "Otto")).toBe("You're 1 point behind Abby for first.");
  });

  it("tells the leader their margin, or that they share first", () => {
    expect(viewerGapLine(board(["Abby", 40], ["Otto", 28]), "Abby")).toBe("You're in first, 12 points ahead of Otto.");
    expect(viewerGapLine(board(["Abby", 40]), "Abby")).toBe("You're in first.");
    expect(viewerGapLine(board(["Abby", 40], ["Otto", 40], ["Sage", 3]), "Abby")).toBe("You're tied for first with Otto.");
  });

  it("explains a pardons tiebreak and stays quiet for someone not on the board", () => {
    // Abby has 38 leaves + 2 pardons, Otto 40 leaves: both 40 points, Abby first on pardons.
    expect(viewerGapLine(board(["Abby", 38, 2], ["Otto", 40]), "Otto")).toBe(
      "You're level with Abby on points; more pardons puts them first."
    );
    expect(viewerGapLine(board(["Abby", 4]), "Player Four")).toBeNull();
  });
});

describe("final hour countdown", () => {
  const close = HARVEST_CONTEST.closesAt.getTime();

  it("covers the dark hour before the close only (11:00 to 11:59 PM)", () => {
    const dark = HARVEST_CONTEST.hiddenFrom.getTime();
    expect(inFinalHour(dark - 1)).toBe(false);
    expect(inFinalHour(dark)).toBe(true);
    expect(inFinalHour(close)).toBe(true);
    expect(inFinalHour(close + 1)).toBe(false);
  });

  it("formats minutes and seconds, never below zero", () => {
    expect(formatCountdown(59 * 60_000 + 12_000)).toBe("59:12");
    expect(formatCountdown(60 * 60_000)).toBe("1:00:00");
    expect(formatCountdown(4_200)).toBe("0:05");
    expect(formatCountdown(-10)).toBe("0:00");
  });
});
