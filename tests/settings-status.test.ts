import { describe, expect, it } from "vitest";
import {
  browserDeviceTag,
  settingsAttention,
  settingsNavStatuses,
  type SettingsStatusInput
} from "@/app/(app)/settings/settings-status";

function input(overrides: Partial<SettingsStatusInput> = {}): SettingsStatusInput {
  return {
    notifications: { loaded: true, error: false, emailEnabled: true, browserEnabled: false, inApp: false },
    browserDevice: "unsubscribed",
    app: null,
    profileError: false,
    pins: { visible: false, anyNotSet: false, error: false },
    signature: { visible: false, hasSignature: false, error: false },
    ...overrides
  };
}

function withNotifications(patch: Partial<SettingsStatusInput["notifications"]>, rest: Partial<SettingsStatusInput> = {}) {
  const base = input(rest);
  return { ...base, notifications: { ...base.notifications, ...patch } };
}

describe("browserDeviceTag", () => {
  it("flags only what the switch can't show", () => {
    expect(browserDeviceTag("unsupported")).toEqual({ label: "Unsupported", tone: "neutral" });
    expect(browserDeviceTag("blocked")).toEqual({ label: "Blocked", tone: "warn" });
  });

  it("never flags a device without a subscription (turning Browser off clears every device)", () => {
    expect(browserDeviceTag("unsubscribed")).toBeNull();
    expect(browserDeviceTag("subscribed")).toBeNull();
    expect(browserDeviceTag("unknown")).toBeNull();
    expect(browserDeviceTag(null)).toBeNull();
  });
});

describe("settingsNavStatuses: notifications", () => {
  it("shows nothing until preferences are on screen", () => {
    expect(settingsNavStatuses(withNotifications({ loaded: false })).notifications).toBeNull();
  });

  it("is ON when email is on, and on the web when browser is on", () => {
    expect(settingsNavStatuses(input()).notifications).toEqual({ label: "On", tone: "ok" });
    expect(
      settingsNavStatuses(withNotifications({ emailEnabled: false, browserEnabled: true }, { browserDevice: "subscribed" }))
        .notifications
    ).toEqual({ label: "On", tone: "ok" });
  });

  it("is OFF when every channel is off; browser doesn't count inside the apps", () => {
    expect(settingsNavStatuses(withNotifications({ emailEnabled: false })).notifications).toEqual({ label: "Off", tone: "warn" });
    expect(
      settingsNavStatuses(withNotifications({ emailEnabled: false, browserEnabled: true, inApp: true })).notifications
    ).toEqual({ label: "Off", tone: "warn" });
  });

  it("is ERROR on a load or save error, even before anything loaded", () => {
    expect(settingsNavStatuses(withNotifications({ error: true, loaded: false })).notifications).toEqual({
      label: "Error",
      tone: "danger"
    });
  });

  it("shows Blocked when Browser is on but this browser blocks it", () => {
    const status = settingsNavStatuses(withNotifications({ browserEnabled: true }, { browserDevice: "blocked" }));
    expect(status.notifications).toEqual({ label: "Blocked", tone: "warn" });
  });

  it("ignores a blocked browser while Browser is off for the account", () => {
    expect(settingsNavStatuses(input({ browserDevice: "blocked" })).notifications).toEqual({ label: "On", tone: "ok" });
  });

  it("uses the InFocus app's own state inside the apps", () => {
    const app = { device: "Mac app", tag: { label: "Not set up", tone: "warn" as const }, error: false };
    expect(settingsNavStatuses(withNotifications({ inApp: true }, { app, browserDevice: null })).notifications).toEqual(
      app.tag
    );
    expect(
      settingsNavStatuses(withNotifications({ inApp: true }, { app: { ...app, tag: null, error: true } })).notifications
    ).toEqual({ label: "Error", tone: "danger" });
  });
});

describe("settingsNavStatuses: other sections", () => {
  it("tags Profile only on an error", () => {
    expect(settingsNavStatuses(input()).profile).toBeNull();
    expect(settingsNavStatuses(input({ profileError: true })).profile).toEqual({ label: "Error", tone: "danger" });
  });

  it("tags PINs only while visible: ERROR over NOT SET", () => {
    expect(settingsNavStatuses(input({ pins: { visible: false, anyNotSet: true, error: true } })).pins).toBeNull();
    expect(settingsNavStatuses(input({ pins: { visible: true, anyNotSet: true, error: false } })).pins).toEqual({
      label: "Not set",
      tone: "neutral"
    });
    expect(settingsNavStatuses(input({ pins: { visible: true, anyNotSet: true, error: true } })).pins).toEqual({
      label: "Error",
      tone: "danger"
    });
    expect(settingsNavStatuses(input({ pins: { visible: true, anyNotSet: false, error: false } })).pins).toBeNull();
  });

  it("tags Signature NOT SET until one is saved, ERROR on a failure", () => {
    expect(settingsNavStatuses(input({ signature: { visible: false, hasSignature: false, error: false } })).signature).toBeNull();
    expect(settingsNavStatuses(input({ signature: { visible: true, hasSignature: false, error: false } })).signature).toEqual({
      label: "Not set",
      tone: "warn"
    });
    expect(settingsNavStatuses(input({ signature: { visible: true, hasSignature: true, error: false } })).signature).toBeNull();
    expect(settingsNavStatuses(input({ signature: { visible: true, hasSignature: true, error: true } })).signature).toEqual({
      label: "Error",
      tone: "danger"
    });
  });
});

describe("settingsAttention", () => {
  it("is empty when nothing needs a look", () => {
    expect(settingsAttention(input())).toEqual([]);
  });

  it("never asks about a device that simply isn't subscribed", () => {
    expect(settingsAttention(withNotifications({ browserEnabled: true }, { browserDevice: "unsubscribed" }))).toEqual([]);
  });

  it("lists errors and warnings with the section to jump to", () => {
    const items = settingsAttention(
      input({
        notifications: { loaded: true, error: false, emailEnabled: false, browserEnabled: false, inApp: false },
        profileError: true,
        pins: { visible: true, anyNotSet: false, error: true },
        signature: { visible: true, hasSignature: false, error: false }
      })
    );
    expect(items).toEqual([
      { id: "notifications", text: "Notifications are off", tone: "warn" },
      { id: "profile", text: "Profile needs attention", tone: "danger" },
      { id: "pins", text: "PINs need attention", tone: "danger" },
      { id: "signature", text: "Signature not set", tone: "warn" }
    ]);
  });

  it("names the device problem, and only while a channel is on", () => {
    expect(settingsAttention(withNotifications({ browserEnabled: true }, { browserDevice: "blocked" }))).toEqual([
      { id: "notifications", text: "Browser notifications are blocked on this device", tone: "warn" }
    ]);
    const app = { device: "iPhone app", tag: { label: "Blocked", tone: "warn" as const }, error: false };
    expect(settingsAttention(withNotifications({ inApp: true }, { app, browserDevice: null }))).toEqual([
      { id: "notifications", text: "iPhone app notifications: blocked", tone: "warn" }
    ]);
    expect(settingsAttention(withNotifications({ inApp: true, emailEnabled: false }, { app, browserDevice: null }))).toEqual([
      { id: "notifications", text: "Notifications are off", tone: "warn" }
    ]);
  });

  it("reports a section error once, not also as off", () => {
    expect(settingsAttention(withNotifications({ error: true, emailEnabled: false }))).toEqual([
      { id: "notifications", text: "Notifications need attention", tone: "danger" }
    ]);
  });
});
