import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldSendOverdueReminder } from "@/src/lib/equipment-overdue";

const mailMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  listEquipmentManagerEmails: vi.fn(),
  sendEquipmentOverdueEmails: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    equipmentCheckout: {
      findMany: mailMocks.findMany,
      update: mailMocks.update
    }
  }
}));

vi.mock("@/src/server/equipment-mail", () => ({
  listEquipmentManagerEmails: mailMocks.listEquipmentManagerEmails,
  sendEquipmentOverdueEmails: mailMocks.sendEquipmentOverdueEmails
}));

import { runEquipmentOverdueJob } from "@/src/server/equipment-overdue";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-09-10T12:00:00.000Z");

describe("shouldSendOverdueReminder", () => {
  it("nudges CHECKED_OUT at or past 72h when never reminded", () => {
    expect(
      shouldSendOverdueReminder({
        status: "CHECKED_OUT",
        checkoutAt: new Date(now.getTime() - 72 * HOUR),
        lastLateReminderAt: null,
        now
      })
    ).toBe(true);
  });
  it("skips under 72h", () => {
    expect(
      shouldSendOverdueReminder({
        status: "CHECKED_OUT",
        checkoutAt: new Date(now.getTime() - 71 * HOUR),
        lastLateReminderAt: null,
        now
      })
    ).toBe(false);
  });
  it("skips if reminded in the last 24h", () => {
    expect(
      shouldSendOverdueReminder({
        status: "CHECKED_OUT",
        checkoutAt: new Date(now.getTime() - 80 * HOUR),
        lastLateReminderAt: new Date(now.getTime() - 23 * HOUR),
        now
      })
    ).toBe(false);
  });
  it("repeats after 24h", () => {
    expect(
      shouldSendOverdueReminder({
        status: "CHECKED_OUT",
        checkoutAt: new Date(now.getTime() - 80 * HOUR),
        lastLateReminderAt: new Date(now.getTime() - 24 * HOUR),
        now
      })
    ).toBe(true);
  });
  it("skips RETURNED", () => {
    expect(
      shouldSendOverdueReminder({
        status: "RETURNED",
        checkoutAt: new Date(now.getTime() - 80 * HOUR),
        lastLateReminderAt: null,
        now
      })
    ).toBe(false);
  });
});

const dueCheckout = {
  id: "co_1",
  status: "CHECKED_OUT" as const,
  checkoutAt: new Date(now.getTime() - 80 * HOUR),
  lastLateReminderAt: null,
  item: { name: "Camera", barcode: "CAM-1" },
  student: { name: "Ada", studentId: "95012345", email: "ada@pausd.us" }
};

describe("runEquipmentOverdueJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mailMocks.findMany.mockResolvedValue([dueCheckout]);
    mailMocks.listEquipmentManagerEmails.mockResolvedValue(["manager@infocus.test"]);
    mailMocks.update.mockResolvedValue({});
  });

  it("stamps lastLateReminderAt when mail is not configured (failed is 0)", async () => {
    mailMocks.sendEquipmentOverdueEmails.mockResolvedValue({
      managers: { configured: false, sent: 0, failed: 0 },
      student: { configured: false, sent: 0, failed: 0 }
    });

    const result = await runEquipmentOverdueJob(now);

    expect(result).toEqual({ reminded: 1, failed: 0 });
    expect(mailMocks.update).toHaveBeenCalledWith({
      where: { id: "co_1" },
      data: { lastLateReminderAt: expect.any(Date) }
    });
  });

  it("does not stamp when manager send failed", async () => {
    mailMocks.sendEquipmentOverdueEmails.mockResolvedValue({
      managers: { configured: true, sent: 0, failed: 1 },
      student: { configured: true, sent: 1, failed: 0 }
    });

    const result = await runEquipmentOverdueJob(now);

    expect(result).toEqual({ reminded: 0, failed: 1 });
    expect(mailMocks.update).not.toHaveBeenCalled();
  });

  it("does not stamp when student send failed", async () => {
    mailMocks.sendEquipmentOverdueEmails.mockResolvedValue({
      managers: { configured: true, sent: 1, failed: 0 },
      student: { configured: true, sent: 0, failed: 1 }
    });

    const result = await runEquipmentOverdueJob(now);

    expect(result).toEqual({ reminded: 0, failed: 1 });
    expect(mailMocks.update).not.toHaveBeenCalled();
  });
});

