import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendBrandedEmails: vi.fn()
}));

vi.mock("@/src/lib/email", () => ({
  sendBrandedEmails: mocks.sendBrandedEmails
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {}
}));

import { sendEquipmentOverdueEmails } from "@/src/server/equipment-mail";

describe("sendEquipmentOverdueEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns manager and student sendBrandedEmails results", async () => {
    mocks.sendBrandedEmails
      .mockResolvedValueOnce({ configured: true, sent: 2, failed: 0 })
      .mockResolvedValueOnce({ configured: true, sent: 1, failed: 0 });

    const result = await sendEquipmentOverdueEmails({
      itemName: "Camera",
      code: "CAM-1",
      studentName: "Ada",
      studentEmail: "ada@pausd.us",
      managerEmails: ["manager@infocus.test"],
      hoursOut: 80
    });

    expect(result).toEqual({
      managers: { configured: true, sent: 2, failed: 0 },
      student: { configured: true, sent: 1, failed: 0 }
    });
    expect(mocks.sendBrandedEmails).toHaveBeenCalledTimes(2);
  });

  it("returns student null when there is no student email", async () => {
    mocks.sendBrandedEmails.mockResolvedValueOnce({ configured: false, sent: 0, failed: 0 });

    const result = await sendEquipmentOverdueEmails({
      itemName: "Camera",
      code: "CAM-1",
      studentName: "Ada",
      managerEmails: ["manager@infocus.test"],
      hoursOut: 80
    });

    expect(result).toEqual({
      managers: { configured: false, sent: 0, failed: 0 },
      student: null
    });
    expect(mocks.sendBrandedEmails).toHaveBeenCalledTimes(1);
  });
});
