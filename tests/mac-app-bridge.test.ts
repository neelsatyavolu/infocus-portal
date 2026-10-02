import { describe, expect, it } from "vitest";
import { isMacAppUserAgent, macNotificationStatusText, parseMacNotificationStatus } from "@/src/lib/mac-app-bridge";

describe("Mac app bridge helpers", () => {
  it("detects the InFocus Mac app user agent", () => {
    expect(isMacAppUserAgent("Mozilla/5.0 (Macintosh) Version/19.0 Safari/605.1.15 InFocusMacApp/2.0.0")).toBe(true);
    expect(isMacAppUserAgent("Mozilla/5.0 (Macintosh) Version/19.0 Safari/605.1.15")).toBe(false);
  });

  it("accepts only well-formed status replies", () => {
    expect(parseMacNotificationStatus({ permission: "authorized", registered: true, appVersion: "2.0.0" })).toEqual({
      permission: "authorized",
      registered: true,
      appVersion: "2.0.0"
    });
    expect(parseMacNotificationStatus({ permission: "maybe", registered: true })).toBeNull();
    expect(parseMacNotificationStatus({ permission: "denied" })).toBeNull();
    expect(parseMacNotificationStatus("authorized")).toBeNull();
  });

  it("explains each state in one line", () => {
    expect(macNotificationStatusText({ permission: "denied", registered: false, appVersion: "" })).toContain("Off in macOS");
    expect(macNotificationStatusText({ permission: "notDetermined", registered: false, appVersion: "" })).toContain("Not set up");
    expect(macNotificationStatusText({ permission: "authorized", registered: false, appVersion: "" })).toContain("isn't registered");
    expect(macNotificationStatusText({ permission: "authorized", registered: true, appVersion: "" })).toMatch(/^On\./);
  });
});
