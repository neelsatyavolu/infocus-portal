import { describe, expect, it } from "vitest";
import {
  MAC_APP_DOWNLOAD_URL,
  macAppAudience,
  macNotificationStatusText,
  parseMacNotificationStatus,
  portalAppDevice
} from "@/src/lib/mac-app-bridge";

const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";

describe("install card audience", () => {
  it("offers the download on a Mac, not on an iPad that claims to be one", () => {
    expect(macAppAudience(SAFARI_MAC, 0)).toBe("mac");
    expect(macAppAudience(SAFARI_MAC, 5)).toBe("other");
  });

  it("recognizes the app itself, and everything else", () => {
    expect(macAppAudience(`${SAFARI_MAC} InFocusMacApp/0.8.0`, 0)).toBe("app");
    expect(macAppAudience("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0", 0)).toBe("other");
    expect(macAppAudience("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) Mobile/15E148", 5)).toBe("other");
  });

  it("downloads the latest release", () => {
    expect(MAC_APP_DOWNLOAD_URL).toMatch(/\/releases\/latest\/download\/InFocus-Drive-mac\.zip$/);
  });
});

describe("Mac app bridge helpers", () => {
  it("detects the InFocus Mac and iPhone app user agents", () => {
    expect(portalAppDevice("Mozilla/5.0 (Macintosh) Version/19.0 Safari/605.1.15 InFocusMacApp/2.0.0")).toBe("mac");
    expect(portalAppDevice("Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1 InFocusiOSApp/1.0")).toBe("iphone");
    expect(portalAppDevice("Mozilla/5.0 (Macintosh) Version/19.0 Safari/605.1.15")).toBeNull();
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

  it("speaks of the iPhone inside the iPhone app", () => {
    expect(macNotificationStatusText({ permission: "denied", registered: false, appVersion: "" }, "iphone")).toContain("iPhone Settings");
    expect(macNotificationStatusText({ permission: "authorized", registered: true, appVersion: "" }, "iphone")).toBe(
      "On. You get an iPhone notification whenever Portal emails you."
    );
  });
});
