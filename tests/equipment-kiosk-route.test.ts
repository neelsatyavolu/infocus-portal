import { beforeEach, describe, expect, it, vi } from "vitest";
import { EQUIPMENT_STATION_COOKIE_NAME } from "@/src/lib/equipment-kiosk";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  kioskCheckout: vi.fn(),
  kioskCheckoutBatch: vi.fn(),
  createPublicRequest: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies
}));

vi.mock("@/src/lib/auth", () => ({
  requireUserId: mocks.requireUserId
}));

vi.mock("@/src/server/equipment-kiosk", () => ({
  kioskCheckout: mocks.kioskCheckout,
  kioskCheckoutBatch: mocks.kioskCheckoutBatch
}));

vi.mock("@/src/server/equipment-requests", () => ({
  createPublicRequest: mocks.createPublicRequest
}));

import { POST as checkout } from "@/app/api/equipment/kiosk/checkout/route";
import { POST as unlockStation } from "@/app/api/equipment/kiosk/unlock/route";
import { POST as createPublicRequestRoute } from "@/app/api/equipment/public/requests/route";

function jsonRequest(
  url: string,
  body: unknown,
  method = "POST",
  extraHeaders?: Record<string, string>
) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body)
  });
}

describe("equipment kiosk routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: mocks.cookieGet,
      set: mocks.cookieSet,
      delete: mocks.cookieDelete
    });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.requireUserId.mockResolvedValue("user_1");
  });

  it("returns 401 for checkout without a station cookie and does not call requireUserId", async () => {
    const response = await checkout(
      jsonRequest("https://infocus.test/api/equipment/kiosk/checkout", {
        studentName: "Ada Lovelace", studentEmail: "ada@pausd.us",
        barcode: "CAM-1"
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.requireUserId).not.toHaveBeenCalled();
    expect(mocks.kioskCheckout).not.toHaveBeenCalled();
    expect(mocks.cookieGet).toHaveBeenCalledWith(EQUIPMENT_STATION_COOKIE_NAME);
  });

  it.each([true, false, undefined])("accepts batch checkout with SD card %s", async (tookSdCard) => {
    mocks.cookieGet.mockReturnValue({ value: "station-token" });
    mocks.kioskCheckoutBatch.mockResolvedValue({ results: [] });
    const response = await checkout(jsonRequest("https://infocus.test/api/equipment/kiosk/checkout", {
      studentName: "Ada Lovelace", studentEmail: "ada@pausd.us", barcodes: [" CAM-1 ", "MIC-1"], tookSdCard
    }));
    expect(response.status).toBe(200);
    expect(mocks.kioskCheckoutBatch).toHaveBeenCalledWith({
      stationToken: "station-token", studentName: "Ada Lovelace", studentEmail: "ada@pausd.us", barcodes: ["CAM-1", "MIC-1"],
      tookSdCard: tookSdCard ?? false
    });
  });

  it.each([[], [""], Array(51).fill("CAM-1")])("rejects invalid batch codes %j", async (barcodes) => {
    mocks.cookieGet.mockReturnValue({ value: "station-token" });
    const response = await checkout(jsonRequest("https://infocus.test/api/equipment/kiosk/checkout", {
      studentName: "Ada Lovelace", studentEmail: "ada@pausd.us", barcodes
    }));
    expect(response.status).toBe(400);
    expect(mocks.kioskCheckoutBatch).not.toHaveBeenCalled();
  });

  it("disables passcode unlock", async () => {
    expect((await unlockStation()).status).toBe(410);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("rate-limits checkout after 40 attempts from the same IP", async () => {
    mocks.cookieGet.mockReturnValue({ value: "station-token" });
    mocks.kioskCheckout.mockResolvedValue({ action: "checkout" });
    const headers = { "x-forwarded-for": "203.0.113.11" };
    const body = { studentName: "Ada Lovelace", studentEmail: "ada@pausd.us", barcode: "CAM-1" };

    for (let i = 0; i < 40; i += 1) {
      const response = await checkout(
        jsonRequest("https://infocus.test/api/equipment/kiosk/checkout", body, "POST", headers)
      );
      expect(response.status).toBe(200);
    }

    const blocked = await checkout(
      jsonRequest("https://infocus.test/api/equipment/kiosk/checkout", body, "POST", headers)
    );
    expect(blocked.status).toBe(429);
    expect(mocks.kioskCheckout).toHaveBeenCalledTimes(40);
  });

  it.each([
    { studentEmail: "ada@pausd.us" },
    { studentName: "Ada" },
    { studentName: " ", studentEmail: "ada@pausd.us" },
    { studentName: "Ada", studentEmail: "bad-email" },
    { studentId: "95012345" }
  ])("requires a name and valid email for checkout: %j", async (contact) => {
    mocks.cookieGet.mockReturnValue({ value: "station-token" });
    const response = await checkout(jsonRequest("https://infocus.test/api/equipment/kiosk/checkout", {
      ...contact, barcodes: ["CAM-1"]
    }));
    expect(response.status).toBe(400);
    expect(mocks.kioskCheckoutBatch).not.toHaveBeenCalled();
  });

  it("creates a public request with no session", async () => {
    mocks.createPublicRequest.mockResolvedValue({ id: "req_1", status: "PENDING" });

    const response = await createPublicRequestRoute(
      jsonRequest("https://infocus.test/api/equipment/public/requests", {
        studentName: "Ada Lovelace",
        studentId: "95012345",
        email: "ada@pausd.us",
        barcodes: ["CAM-1"]
      })
    );

    expect([200, 201]).toContain(response.status);
    expect(mocks.requireUserId).not.toHaveBeenCalled();
    expect(mocks.createPublicRequest).toHaveBeenCalledWith({
      studentName: "Ada Lovelace",
      studentId: "95012345",
      email: "ada@pausd.us",
      barcodes: ["CAM-1"]
    });
  });
});
