import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({
  prisma: {}
}));

import {
  canAppointEquipmentManagers,
  canManageEquipmentWithAppointment
} from "@/src/server/equipment-access";

describe("canManageEquipmentWithAppointment", () => {
  it("lets associate+ manage without an appointment", () => {
    expect(canManageEquipmentWithAppointment("ASSOCIATE_PRODUCER", false)).toBe(true);
    expect(canManageEquipmentWithAppointment("EXECUTIVE_PRODUCER", false)).toBe(true);
    expect(canManageEquipmentWithAppointment("ADVISER", false)).toBe(true);
    expect(canManageEquipmentWithAppointment("SUPER_ADMIN", false)).toBe(true);
  });

  it("denies a null role unless appointed", () => {
    expect(canManageEquipmentWithAppointment(null, false)).toBe(false);
    expect(canManageEquipmentWithAppointment(null, true)).toBe(true);
  });
});

describe("canAppointEquipmentManagers", () => {
  it("lets associate+ appoint extra managers", () => {
    expect(canAppointEquipmentManagers("ASSOCIATE_PRODUCER")).toBe(true);
    expect(canAppointEquipmentManagers("EXECUTIVE_PRODUCER")).toBe(true);
    expect(canAppointEquipmentManagers("ADVISER")).toBe(true);
    expect(canAppointEquipmentManagers("SUPER_ADMIN")).toBe(true);
  });

  it("denies a null role", () => {
    expect(canAppointEquipmentManagers(null)).toBe(false);
  });
});
