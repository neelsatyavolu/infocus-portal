import { describe, expect, it } from "vitest";
import { filterNames } from "@/src/lib/name-search";

const NAMES = ["Abby Example", "Otto Sample", "Sage Rabbitt", "Zoë Test"];

describe("filterNames", () => {
  it("returns every name for a blank query", () => {
    expect(filterNames(NAMES, "")).toEqual(NAMES);
    expect(filterNames(NAMES, "   ")).toEqual(NAMES);
  });

  it("matches anywhere in the name, ignoring case", () => {
    expect(filterNames(NAMES, "abb")).toEqual(["Abby Example", "Sage Rabbitt"]);
    expect(filterNames(NAMES, "SAMPLE")).toEqual(["Otto Sample"]);
  });

  it("requires every word of the query to match", () => {
    expect(filterNames(NAMES, "sa ab")).toEqual(["Sage Rabbitt"]);
    expect(filterNames(NAMES, "abby sample")).toEqual([]);
  });

  it("ignores accents on either side", () => {
    expect(filterNames(NAMES, "zoe")).toEqual(["Zoë Test"]);
    expect(filterNames(["Zoe Test"], "zoë")).toEqual(["Zoe Test"]);
  });

  it("does not change the input list", () => {
    const names = [...NAMES];
    filterNames(names, "abb");
    expect(names).toEqual(NAMES);
  });
});
