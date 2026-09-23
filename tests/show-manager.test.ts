import { describe, expect, it } from "vitest";
import { FIRST_SHOW_DATE } from "@/src/lib/school-schedule";
import { listShowDatesThrough } from "@/src/lib/show-assignment";
import {
  buildShowManagerPool,
  resolveShowManager,
  resolveShowManagersForDates,
  rotatedShowManager
} from "@/src/lib/show-manager";

describe("show manager rotation", () => {
  it("counts show days from the first air date, skipping holidays", () => {
    const dates = listShowDatesThrough("2026-09-11");
    expect(dates[0]).toBe(FIRST_SHOW_DATE);
    expect(dates).toEqual(["2026-09-04", "2026-09-09", "2026-09-11"]);
  });

  it("shifts the index when a show is moved", () => {
    const overrides = new Map([
      ["2026-09-09", { kind: "HOLIDAY" as const, label: "Moved" }],
      ["2026-09-08", { kind: "SHOW" as const, label: "Show moved" }]
    ]);
    expect(listShowDatesThrough("2026-09-11", overrides)).toEqual([
      "2026-09-04",
      "2026-09-08",
      "2026-09-11"
    ]);
  });

  it("rotates EPs, the super-admin, and APs in first-name order", () => {
    const pool = buildShowManagerPool(
      [
        { name: "Neel Satyavolu", email: "superadmin@example.edu" },
        { name: "Lucas Hale", email: "lucas@pausd.us" },
        { name: "Abby Chen", email: "abby@pausd.us" },
        { name: "Pat Adviser", email: "adviser@example.edu" },
        { name: "Mabel Jones", email: "mabel@pausd.us" }
      ],
      ["lucas@pausd.us", "abby@pausd.us", "adviser@example.edu"]
    );

    expect(pool).toEqual(["Abby", "Lucas", "Neel"]);
    expect(rotatedShowManager(pool, 0)).toBe("Abby");
    expect(rotatedShowManager(pool, 3)).toBe("Abby");
    expect(rotatedShowManager(pool, 2)).toBe("Neel");
  });

  it("keeps a manual override and otherwise uses rotation", () => {
    const showDates = ["2026-09-04", "2026-09-09", "2026-09-11"];
    const pool = ["Abby", "Lucas", "Neel"];
    expect(
      resolveShowManager({ dateKey: "2026-09-09", pool, showDates, override: "" })
    ).toEqual({ name: "Lucas", source: "rotation" });
    expect(
      resolveShowManager({ dateKey: "2026-09-09", pool, showDates, override: "Neel" })
    ).toEqual({ name: "Neel", source: "manual" });
  });

  it("restarts later automatic days after a manual pick so the next show is not a duplicate", () => {
    const managers = resolveShowManagersForDates({
      dateKeys: ["2026-09-04", "2026-09-09", "2026-09-11", "2026-09-14"],
      pool: ["Abby", "Lucas"],
      overridesByDate: new Map([["2026-09-04", "Lucas"]])
    });
    expect(managers["2026-09-04"]).toEqual({ name: "Lucas", source: "manual" });
    expect(managers["2026-09-09"]).toEqual({ name: "Abby", source: "rotation" });
    expect(managers["2026-09-11"]).toEqual({ name: "Lucas", source: "rotation" });
    expect(managers["2026-09-14"]).toBeUndefined();
  });

  it("leaves earlier automatic days in place when a later show is overridden", () => {
    const managers = resolveShowManagersForDates({
      dateKeys: ["2026-09-04", "2026-09-09", "2026-09-11"],
      pool: ["Abby", "Lucas", "Neel"],
      overridesByDate: new Map([["2026-09-09", "Abby"]])
    });
    expect(managers["2026-09-04"]).toEqual({ name: "Abby", source: "rotation" });
    expect(managers["2026-09-09"]).toEqual({ name: "Abby", source: "manual" });
    expect(managers["2026-09-11"]).toEqual({ name: "Lucas", source: "rotation" });
  });
});
