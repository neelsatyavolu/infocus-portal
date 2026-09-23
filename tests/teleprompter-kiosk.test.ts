import { describe, expect, it, afterEach } from "vitest";
import {
  isTeleprompterKioskPath,
  isValidTeleprompterKioskToken
} from "@/src/lib/teleprompter-kiosk";

const originalToken = process.env.TELEPROMPTER_KIOSK_TOKEN;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.TELEPROMPTER_KIOSK_TOKEN;
  } else {
    process.env.TELEPROMPTER_KIOSK_TOKEN = originalToken;
  }
});

describe("isValidTeleprompterKioskToken", () => {
  it("rejects when no token is configured", () => {
    delete process.env.TELEPROMPTER_KIOSK_TOKEN;
    expect(isValidTeleprompterKioskToken("anything")).toBe(false);
  });

  it("accepts only the configured token", () => {
    process.env.TELEPROMPTER_KIOSK_TOKEN = "studio-kiosk-secret";
    expect(isValidTeleprompterKioskToken("studio-kiosk-secret")).toBe(true);
    expect(isValidTeleprompterKioskToken("nope")).toBe(false);
    expect(isValidTeleprompterKioskToken("")).toBe(false);
  });
});

describe("isTeleprompterKioskPath", () => {
  it("allows the teleprompter app and APIs only", () => {
    expect(isTeleprompterKioskPath("/")).toBe(true);
    expect(isTeleprompterKioskPath("/teleprompter")).toBe(true);
    expect(isTeleprompterKioskPath("/api/teleprompter/docs/abc")).toBe(true);
    expect(isTeleprompterKioskPath("/settings")).toBe(false);
    expect(isTeleprompterKioskPath("/api/workspaces")).toBe(false);
  });
});
