import { describe, expect, it } from "vitest";
import { formatDate, getCurrentShowDate, isShowDay, nextShowDate } from "@/src/show-roles/lib/date";

describe("show roles show dates", () => {
  it("treats Wednesday and Friday school days as show days", () => {
    expect(isShowDay("2026-09-30")).toBe(true);
    expect(isShowDay("2026-09-25")).toBe(true);
    expect(isShowDay("2026-09-28")).toBe(false);
  });

  it("does not treat a no-school Friday as a show day", () => {
    // Fri Oct 2, 2026 is a Staff Development Day.
    expect(isShowDay("2026-10-02")).toBe(false);
  });

  it("moves past a no-school Friday to the next show", () => {
    expect(formatDate(getCurrentShowDate(new Date(2026, 8, 28)))).toBe("2026-09-30");
    expect(formatDate(getCurrentShowDate(new Date(2026, 8, 30)))).toBe("2026-10-07");
    expect(formatDate(getCurrentShowDate(new Date(2026, 9, 1)))).toBe("2026-10-07");
    expect(formatDate(nextShowDate(new Date(2026, 8, 30)))).toBe("2026-10-07");
  });

  it("keeps the usual Wednesday to Friday hop in a normal week", () => {
    expect(formatDate(getCurrentShowDate(new Date(2026, 8, 23)))).toBe("2026-09-25");
    expect(formatDate(getCurrentShowDate(new Date(2026, 8, 25)))).toBe("2026-09-30");
  });
});
