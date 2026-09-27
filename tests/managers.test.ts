import { describe, expect, it } from "vitest";
import { accessFromAppointments, appointedAreas, managerAreas, type ManagerAccess } from "@/src/lib/managers";

const NOBODY: ManagerAccess = { isProducer: false, isEquipmentManager: false, isPublishingManager: false, isSocialMediaManager: false };
const areasFor = (access: Partial<ManagerAccess>) =>
  Object.fromEntries(managerAreas({ ...NOBODY, ...access }).map((area) => [area.id, area]));

describe("managerAreas", () => {
  it("lists the four manager areas in order with their destinations", () => {
    expect(managerAreas(NOBODY).map((area) => [area.id, area.href])).toEqual([
      ["equipment", "/equipment/manage"],
      ["livestreams", "/livestreams"],
      ["website", "/publishing-queue"],
      ["social-media", "/managers/social-media"]
    ]);
  });

  it("lets producers open every area", () => {
    expect(managerAreas({ ...NOBODY, isProducer: true }).every((area) => area.canOpen)).toBe(true);
  });

  it("opens each area for its own appointed managers only", () => {
    expect(areasFor({ isEquipmentManager: true }).equipment.canOpen).toBe(true);
    expect(areasFor({ isPublishingManager: true }).website.canOpen).toBe(true);
    expect(areasFor({ isSocialMediaManager: true })["social-media"].canOpen).toBe(true);
    expect(areasFor({ isEquipmentManager: true }).website.canOpen).toBe(false);
    expect(areasFor({ isPublishingManager: true })["social-media"].canOpen).toBe(false);
  });

  it("keeps only the livestream tracker open to every member", () => {
    const areas = areasFor({});
    expect(areas.livestreams.canOpen).toBe(true);
    expect(areas.equipment.canOpen).toBe(false);
    expect(areas.website.canOpen).toBe(false);
    expect(areas["social-media"].canOpen).toBe(false);
  });

  it("explains who can open each area", () => {
    for (const area of managerAreas(NOBODY)) expect(area.access.length).toBeGreaterThan(0);
  });
});

describe("appointedAreas", () => {
  const rosters = {
    equipment: [{ userId: "abby", name: "Abby" }],
    livestreams: [{ userId: "otto", name: "Otto" }, { userId: "abby", name: "Abby" }],
    website: [],
    "social-media": [{ userId: "sage", name: "Sage" }]
  };

  it("lists the areas a person is appointed to, in card order", () => {
    expect(appointedAreas("abby", rosters)).toEqual(["equipment", "livestreams"]);
    expect(appointedAreas("sage", rosters)).toEqual(["social-media"]);
    expect(appointedAreas("nobody", rosters)).toEqual([]);
  });

  it("turns appointments into card access", () => {
    expect(accessFromAppointments(false, ["website", "social-media"])).toEqual({
      isProducer: false, isEquipmentManager: false, isPublishingManager: true, isSocialMediaManager: true
    });
  });
});
