import { expect, it } from "vitest";
import { groupCalendarDays } from "@/src/lib/calendar-day-groups";

const day = (date: string, label = "Summer break", source = "config") => ({ date, kind: "HOLIDAY", label, source });

it("joins like days across a weekend and splits on a gap or a different day", () => {
  const groups = groupCalendarDays([
    day("2027-06-08"), day("2027-06-04"), day("2027-06-07"),
    day("2027-06-09", "Finals week", "feed"),
    day("2027-06-10"), day("2027-06-21")
  ]);
  expect(groups.map((group) => [group.from, group.to, group.label, group.dates.length])).toEqual([
    ["2027-06-04", "2027-06-08", "Summer break", 3],
    ["2027-06-09", "2027-06-09", "Finals week", 1],
    ["2027-06-10", "2027-06-10", "Summer break", 1],
    ["2027-06-21", "2027-06-21", "Summer break", 1]
  ]);
});
