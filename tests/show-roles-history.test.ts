import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/server/show-cast", () => ({
  listShowRolesPool: vi.fn(async () => ({
    members: ["Associate", "Executive", "Reporter"], randomExempt: ["Executive"]
  }))
}));
vi.mock("@/src/server/show-manager", () => ({
  resolveShowManagers: vi.fn(async () => ({
    pool: ["Associate", "Executive", "Admin"],
    managers: {
      "2026-09-04": { name: "Associate", source: "rotation" },
      "2026-09-09": { name: "Executive", source: "manual" },
      "2026-09-11": { name: "Associate", source: "manual" },
      "2026-09-16": { name: "Reporter", source: "manual" }
    }
  }))
}));

import { withAssociateShowManagers } from "@/src/server/show-roles-history";

describe("show role manager history", () => {
  it("counts resolved AP manager duty only, replacing client-supplied values", async () => {
    const dates = ["2026-09-04", "2026-09-09", "2026-09-11", "2026-09-16", "2026-09-18"];
    const result = await withAssociateShowManagers(dates.map((date) => ({ date, associateShowManager: "Forged" })));
    expect(result.map((show) => show.associateShowManager)).toEqual(["Associate", "", "Associate", "", ""]);
  });
});
