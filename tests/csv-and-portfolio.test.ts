import { describe, expect, it } from "vitest";
import { buildCsv, csvFilename, csvLine, csvResponse, csvValue } from "@/src/lib/csv";
import {
  currentPortfolioSemester,
  portfolioLinkSchema,
  portfolioPointsOrNull,
  portfolioSemesterSchema
} from "@/src/lib/portfolio";

describe("csv helpers", () => {
  it("quotes only values with quotes, commas or line breaks", () => {
    expect(csvValue(null)).toBe("");
    expect(csvValue(12.5)).toBe("12.5");
    expect(csvValue("plain")).toBe("plain");
    expect(csvValue('Say "hi", Abby')).toBe('"Say ""hi"", Abby"');
    expect(csvValue("two\nlines")).toBe('"two\nlines"');
    expect(csvLine(["a", null, 3])).toBe("a,,3");
  });

  it("builds a document with Yes/No booleans and formula-safe text", () => {
    expect(buildCsv(["Name", "Out", "Note"], [["Otto", true, "=SUM(A1)"], ["Sage", false, "-2 days"]])).toBe(
      "Name,Out,Note\nOtto,Yes,'=SUM(A1)\nSage,No,-2 days"
    );
  });

  it("names files by the Pacific date and sends a download response", async () => {
    // 07:30 UTC on Nov 12 is still Nov 11 in Pacific.
    expect(csvFilename("members", new Date("2026-11-12T07:30:00.000Z"))).toBe("members-2026-11-11.csv");
    const response = csvResponse("members-2026-11-11.csv", "a,b");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="members-2026-11-11.csv"');
    expect(await response.text()).toBe("a,b");
  });
});

describe("portfolio helpers", () => {
  it("treats the ungraded marker as null", () => {
    expect(portfolioPointsOrNull(null)).toBeNull();
    expect(portfolioPointsOrNull(undefined)).toBeNull();
    expect(portfolioPointsOrNull(0)).toBe(0);
    expect(portfolioPointsOrNull(88)).toBe(88);
  });

  it("keys the semester by the semesterForDate label", () => {
    expect(currentPortfolioSemester(new Date("2026-11-11T12:00:00.000Z"))).toBe("2026-27 S1");
    expect(currentPortfolioSemester(new Date("2027-02-01T12:00:00.000Z"))).toBe("2026-27 S2");
    expect(portfolioSemesterSchema.safeParse("2026-27 S1").success).toBe(true);
    expect(portfolioSemesterSchema.safeParse("fall").success).toBe(false);
  });

  it("accepts only https links", () => {
    expect(portfolioLinkSchema.safeParse("https://example.edu/portfolio").success).toBe(true);
    expect(portfolioLinkSchema.safeParse("http://example.edu/portfolio").success).toBe(false);
    expect(portfolioLinkSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(portfolioLinkSchema.safeParse("not a link").success).toBe(false);
  });
});
