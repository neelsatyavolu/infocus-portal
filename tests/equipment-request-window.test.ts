import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatPacificWindowTime, validateRequestWindow } from "@/src/lib/equipment-request-window";

const mocks = vi.hoisted(() => ({ sendBrandedEmails: vi.fn() }));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import { sendEquipmentDecisionEmail } from "@/src/server/equipment-mail";

const now = new Date("2026-11-11T20:00:00.000Z");

describe("validateRequestWindow", () => {
  it("accepts a future pickup with a later return", () => {
    expect(
      validateRequestWindow({
        pickupAt: new Date("2026-11-12T16:00:00.000Z"),
        returnAt: new Date("2026-11-13T16:00:00.000Z"),
        now
      })
    ).toBeNull();
  });

  it("rejects a pickup in the past (beyond the grace minutes)", () => {
    expect(
      validateRequestWindow({
        pickupAt: new Date("2026-11-11T19:00:00.000Z"),
        returnAt: new Date("2026-11-12T19:00:00.000Z"),
        now
      })
    ).toBe("PICKUP_IN_PAST");
    expect(
      validateRequestWindow({
        pickupAt: new Date("2026-11-11T19:58:00.000Z"),
        returnAt: new Date("2026-11-12T19:00:00.000Z"),
        now
      })
    ).toBeNull();
  });

  it("rejects a return at or before pickup", () => {
    const pickupAt = new Date("2026-11-12T16:00:00.000Z");
    expect(validateRequestWindow({ pickupAt, returnAt: pickupAt, now })).toBe("RETURN_BEFORE_PICKUP");
    expect(
      validateRequestWindow({ pickupAt, returnAt: new Date("2026-11-12T15:00:00.000Z"), now })
    ).toBe("RETURN_BEFORE_PICKUP");
  });
});

describe("formatPacificWindowTime", () => {
  it("shows Pacific wall time", () => {
    // 00:30 UTC on Nov 12 is 4:30 PM on Nov 11 in Pacific (PST).
    expect(formatPacificWindowTime("2026-11-12T00:30:00.000Z")).toBe("Wed, Nov 11, 4:30 PM");
    expect(formatPacificWindowTime(null)).toBe("—");
  });
});

describe("sendEquipmentDecisionEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
  });

  it("emails only the requester, with each denied item's reason", async () => {
    await sendEquipmentDecisionEmail({
      requestId: "req_1",
      email: "abby@example.edu",
      studentName: "Abby",
      decision: "DENIED",
      pickupAt: null,
      returnAt: null,
      items: [
        { name: "Camera", barcode: "CAM-1", reason: "Reserved for the show" },
        { name: "Tripod", barcode: "TRI-1", reason: null }
      ]
    });
    const call = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(call.recipients).toEqual(["abby@example.edu"]);
    expect(call.subject).toMatch(/denied/);
    expect(call.paragraphs).toContain("Denied: Camera (CAM-1): Reserved for the show");
    expect(call.paragraphs).toContain("Denied: Tripod (TRI-1)");
  });

  it("includes the pickup window on approval", async () => {
    await sendEquipmentDecisionEmail({
      requestId: "req_2",
      email: "otto@example.edu",
      studentName: null,
      decision: "APPROVED",
      pickupAt: new Date("2026-11-12T00:30:00.000Z"),
      returnAt: new Date("2026-11-13T00:30:00.000Z"),
      items: [{ name: "Camera", barcode: "CAM-1" }]
    });
    const call = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(call.subject).toMatch(/approved/);
    expect(call.paragraphs.join("\n")).toContain("Pickup: Wed, Nov 11, 4:30 PM");
  });
});
