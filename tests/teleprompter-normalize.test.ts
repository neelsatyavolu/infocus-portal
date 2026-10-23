import { describe, expect, it } from "vitest";
import { normalizeSpokenWord, numberToWords } from "@/src/lib/teleprompter-normalize";

describe("numberToWords", () => {
  it("spells out cardinals", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(7)).toBe("seven");
    expect(numberToWords(15)).toBe("fifteen");
    expect(numberToWords(42)).toBe("forty two");
    expect(numberToWords(100)).toBe("one hundred");
    expect(numberToWords(1500)).toBe("one thousand five hundred");
    expect(numberToWords(2_000_016)).toBe("two million sixteen");
  });
});

describe("normalizeSpokenWord", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeSpokenWord("PALY!")).toEqual(["paly"]);
    expect(normalizeSpokenWord("Morning,")).toEqual(["morning"]);
    expect(normalizeSpokenWord("\"Vikings.\"")).toEqual(["vikings"]);
    expect(normalizeSpokenWord("I'm")).toEqual(["im"]);
    expect(normalizeSpokenWord("today’s")).toEqual(["todays"]);
  });

  it("splits hyphenated and slashed words", () => {
    expect(normalizeSpokenWord("co-anchor")).toEqual(["co", "anchor"]);
    expect(normalizeSpokenWord("and/or")).toEqual(["and", "or"]);
  });

  it("returns nothing for punctuation-only words", () => {
    expect(normalizeSpokenWord("—")).toEqual([]);
    expect(normalizeSpokenWord("...")).toEqual([]);
    expect(normalizeSpokenWord("-")).toEqual([]);
  });

  it("says & as and", () => {
    expect(normalizeSpokenWord("&")).toEqual(["and"]);
  });

  it("reads years in pairs", () => {
    expect(normalizeSpokenWord("2026.")).toEqual(["twenty", "twenty", "six"]);
    expect(normalizeSpokenWord("1999")).toEqual(["nineteen", "ninety", "nine"]);
    expect(normalizeSpokenWord("2005")).toEqual(["two", "thousand", "five"]);
    expect(normalizeSpokenWord("2000")).toEqual(["two", "thousand"]);
  });

  it("reads other numbers as cardinals", () => {
    expect(normalizeSpokenWord("12")).toEqual(["twelve"]);
    expect(normalizeSpokenWord("1,500")).toEqual(["one", "thousand", "five", "hundred"]);
    expect(normalizeSpokenWord("50%")).toEqual(["fifty", "percent"]);
  });

  it("reads ordinals", () => {
    expect(normalizeSpokenWord("23rd,")).toEqual(["twenty", "third"]);
    expect(normalizeSpokenWord("4th")).toEqual(["fourth"]);
    expect(normalizeSpokenWord("1st")).toEqual(["first"]);
    expect(normalizeSpokenWord("12th")).toEqual(["twelfth"]);
    expect(normalizeSpokenWord("20th")).toEqual(["twentieth"]);
  });

  it("reads clock times", () => {
    expect(normalizeSpokenWord("3:30")).toEqual(["three", "thirty"]);
    expect(normalizeSpokenWord("7:05")).toEqual(["seven", "oh", "five"]);
    expect(normalizeSpokenWord("11:00")).toEqual(["eleven"]);
  });

  it("spells out the InFocus handle and website", () => {
    expect(normalizeSpokenWord("@infocusnews")).toEqual(["at", "in", "focus", "news"]);
    expect(normalizeSpokenWord("infocusnews.tv")).toEqual(["in", "focus", "news", "dot", "tv"]);
    expect(normalizeSpokenWord("InFocus")).toEqual(["in", "focus"]);
  });

  it("keeps a.m. and p.m. as one word", () => {
    expect(normalizeSpokenWord("a.m.")).toEqual(["am"]);
    expect(normalizeSpokenWord("p.m.,")).toEqual(["pm"]);
  });

  it("matches what a recognizer would write for the same words", () => {
    const script = ["Friday,", "October", "23rd,", "2026."].flatMap(normalizeSpokenWord);
    const heard = ["friday", "october", "twenty", "third", "twenty", "twenty", "six"].flatMap(normalizeSpokenWord);
    expect(script).toEqual(heard);
  });
});
