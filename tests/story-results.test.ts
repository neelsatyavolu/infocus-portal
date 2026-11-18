import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatShare,
  lastName,
  marginLine,
  measureResult,
  ordinal,
  parseCandidates,
  parseFigures,
  ranked,
  seatSplit,
  statusLabel,
  withShares
} from "@/src/lib/story-results";

const ALASKA = "Mary Peltola | D | 144,302 | Democrat\nDan Sullivan | R | 131,844 | Incumbent\nGerald Heikes | R | 6,111\nDaniel J. Sullivan Jr. | I | 4,760";

describe("parseCandidates", () => {
  it("reads name, party, votes and label from each line", () => {
    expect(parseCandidates(ALASKA)[0]).toEqual({ name: "Mary Peltola", party: "D", votes: 144302, share: null, label: "Democrat" });
  });

  it("reads shares typed with a percent sign", () => {
    expect(parseCandidates("Linda Henigin | | 36.8%")[0]).toMatchObject({ votes: null, share: 36.8, party: "N" });
  });

  it("skips empty lines and keeps at most the maximum", () => {
    expect(parseCandidates("\nA\n\nB\nC", 2).map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("treats unknown parties as nonpartisan and bad numbers as missing", () => {
    expect(parseCandidates("Ed Lauing | Green | lots")[0]).toMatchObject({ party: "N", votes: null });
  });
});

describe("withShares", () => {
  it("counts write-ins in the total, so shares match the source", () => {
    const shares = withShares(parseCandidates(ALASKA), 886).map((c) => c.share);
    expect(shares).toEqual([50.12, 45.79, 2.12, 1.65]);
  });

  it("keeps typed shares when any candidate has no count", () => {
    const list = parseCandidates("A | D | 52% \nB | R | 48%");
    expect(withShares(list)).toEqual(list);
  });

  it("does not change its input", () => {
    const list = parseCandidates(ALASKA);
    withShares(list);
    expect(list[0].share).toBeNull();
  });
});

describe("margins and status", () => {
  const list = withShares(parseCandidates(ALASKA), 886);

  it("ranks by share", () => {
    expect(ranked([...list].reverse())[0].name).toBe("Mary Peltola");
  });

  it("states the margin in votes", () => {
    expect(marginLine(list)).toBe("12,458-vote margin");
  });

  it("states the gap at the cut line for multi-seat races", () => {
    const council = withShares(parseCandidates("A | | 300\nB | | 200\nC | | 150\nD | | 100"));
    expect(marginLine(council, 3)).toBe("50 votes separate 3rd and 4th");
  });

  it("only says wins when the race is called", () => {
    const leader = ranked(list)[0];
    expect(statusLabel("wins", leader)).toBe("Peltola wins");
    expect(statusLabel("leads", leader)).toBe("Peltola leads");
    expect(statusLabel("close", leader)).toBe("Too close to call");
    expect(statusLabel("none", leader)).toBe("");
  });

  it("uses last names without suffixes", () => {
    expect(lastName("Daniel J. Sullivan Jr.")).toBe("Sullivan");
  });
});

describe("measureResult", () => {
  it("works out shares from counts and the distance from the threshold", () => {
    expect(measureResult("14,158", "13,266")).toMatchObject({ yesShare: 51.63, noShare: 48.37, threshold: 50, pointsFromThreshold: 1.6 });
  });

  it("accepts shares and a two-thirds threshold", () => {
    expect(measureResult("62%", "", "66.67")).toMatchObject({ yesShare: 62, noShare: 38, pointsFromThreshold: -4.7 });
  });

  it("returns null when Yes isn't a number", () => {
    expect(measureResult("soon", "")).toBeNull();
  });
});

describe("parseFigures and seatSplit", () => {
  it("reads figure, title, detail and an optional party", () => {
    expect(parseFigures("55 | Democratic seats | Up from 54 | D\n1982 | Last time")).toEqual([
      { figure: "55", title: "Democratic seats", detail: "Up from 54", party: "D" },
      { figure: "1982", title: "Last time", detail: "", party: null }
    ]);
  });

  it("clamps seats to the chamber", () => {
    expect(seatSplit("100", "56", "60")).toEqual({ total: 100, dem: 56, rep: 44, undecided: 0 });
    expect(seatSplit("435", "210", "200")).toMatchObject({ undecided: 25 });
  });
});

describe("formatting", () => {
  it("formats shares to one decimal and counts with commas", () => {
    expect(formatShare(50.12)).toBe("50.1%");
    expect(formatShare(null)).toBe("–");
    expect(formatCount(144302)).toBe("144,302");
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("parseStats", () => {
  it("reads up to three figures with an optional party", async () => {
    const { parseStats } = await import("@/src/lib/story-results");
    expect(parseStats("12,458 | votes ahead\n50.1% | Peltola | D\n45.8% | Sullivan | R\n1 | extra")).toEqual([
      { figure: "12,458", label: "votes ahead", party: null },
      { figure: "50.1%", label: "Peltola", party: "D" },
      { figure: "45.8%", label: "Sullivan", party: "R" }
    ]);
  });
});

describe("review fixes", () => {
  it("won't name a leader when units are mixed or the cutoff is tied", async () => {
    const { clearOrder } = await import("@/src/lib/story-results");
    expect(clearOrder(withShares(parseCandidates("A | N | 950\nB | N | 5%")))).toBe(false);
    expect(clearOrder(withShares(parseCandidates("A | N | 500\nB | N | 500")))).toBe(false);
    expect(clearOrder(withShares(parseCandidates("A | N | 501\nB | N | 500")))).toBe(true);
    expect(clearOrder(withShares(parseCandidates("A | N | 300\nB | N | 300\nC | N | 100")), 2)).toBe(true);
  });

  it("reads a lone count as no result, not a share", () => {
    expect(measureResult("12", "")).toBeNull();
    expect(measureResult("0", "0")).toBeNull();
    expect(measureResult("60%", "60%")).toBeNull();
    expect(measureResult("60%", "300")).toBeNull();
    expect(measureResult("55%", "45%")).toMatchObject({ yesShare: 55, noShare: 45 });
  });
});
