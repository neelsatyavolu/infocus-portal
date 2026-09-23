import { describe, expect, it } from "vitest";
import {
  defaultTemplateForKind,
  holidayTemplate,
  isScenicImageDay,
  PA_TEMPLATE,
  SHOW_TEMPLATE
} from "@/src/lib/master-calendar-cells";
import { resolveScheduleDay, scheduleKindForDate } from "@/src/lib/school-schedule";

describe("master calendar schedule cells", () => {
  it("maps weekday defaults to Mon PA, Tue/Thu images, Wed/Fri shows", () => {
    expect(resolveScheduleDay("2026-09-14")).toMatchObject({ kind: "PA" });
    expect(resolveScheduleDay("2026-09-15")).toMatchObject({ kind: "NONE" });
    expect(resolveScheduleDay("2026-09-16")).toMatchObject({ kind: "SHOW" });
    expect(resolveScheduleDay("2026-09-17")).toMatchObject({ kind: "NONE" });
    expect(resolveScheduleDay("2026-09-18")).toMatchObject({ kind: "SHOW" });
  });

  it("does not treat Wed/Fri before the first show as air dates", () => {
    expect(resolveScheduleDay("2026-09-02")).toMatchObject({ kind: "NONE" });
    expect(resolveScheduleDay("2026-08-05")).toMatchObject({ kind: "NONE" });
    expect(resolveScheduleDay("2026-09-04")).toMatchObject({ kind: "SHOW" });
  });

  it("uses PA / show / empty / holiday templates from kind", () => {
    expect(defaultTemplateForKind("PA")).toBe(PA_TEMPLATE);
    expect(defaultTemplateForKind("SHOW")).toBe(SHOW_TEMPLATE);
    expect(defaultTemplateForKind("NONE")).toBe("");
    expect(defaultTemplateForKind("HOLIDAY", "Labor Day")).toBe(holidayTemplate("Labor Day"));
    expect(isScenicImageDay("NONE")).toBe(true);
    expect(isScenicImageDay("PA")).toBe(false);
    expect(isScenicImageDay("HOLIDAY")).toBe(false);
  });

  it("keeps seeded PAUSD holidays off the show/PA/image rotation", () => {
    expect(resolveScheduleDay("2026-08-10")).toMatchObject({
      kind: "HOLIDAY",
      label: "District Day"
    });
    expect(resolveScheduleDay("2026-08-11")).toMatchObject({
      kind: "HOLIDAY",
      label: "Staff Development Day (9–12)"
    });
    expect(resolveScheduleDay("2026-08-12")).toMatchObject({
      kind: "HOLIDAY",
      label: "Teacher Work Day"
    });
    expect(resolveScheduleDay("2026-09-07")).toMatchObject({
      kind: "HOLIDAY",
      label: "Labor Day"
    });
    expect(scheduleKindForDate(new Date("2026-09-07T00:00:00.000Z"))).toBe("HOLIDAY");
  });

  it("lets stored overrides move a show onto a nearby weekday", () => {
    const overrides = new Map([
      ["2026-11-25", { kind: "HOLIDAY" as const, label: "Thanksgiving Break" }],
      ["2026-11-24", { kind: "SHOW" as const, label: "Show moved" }]
    ]);

    expect(resolveScheduleDay("2026-11-25", overrides).kind).toBe("HOLIDAY");
    expect(resolveScheduleDay("2026-11-24", overrides)).toMatchObject({
      kind: "SHOW",
      label: "Show moved"
    });
    expect(defaultTemplateForKind("SHOW")).toContain("Anchors:");
  });
});
