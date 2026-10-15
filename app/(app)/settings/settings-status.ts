import type { SettingsNavStatus } from "@/components/settings-layout";

/**
 * Status tags for the Settings rail and the header's context line, read from state the page
 * already has (no fetches). Notifications always shows a tag (ON / OFF, or the device problem);
 * the other items only show one for an exception (NOT SET, ERROR).
 */

type SettingsSectionId = "notifications" | "appearance" | "profile" | "pins" | "signature" | "mac-app" | "apps";

/** This browser's web push state, read without prompting. */
export type BrowserDeviceState = "unsupported" | "blocked" | "subscribed" | "unsubscribed" | "unknown";

export type SettingsStatusInput = {
  notifications: {
    /** Preferences are on screen (loaded or remembered). */
    loaded: boolean;
    error: boolean;
    emailEnabled: boolean;
    browserEnabled: boolean;
    /** Inside the InFocus Mac or iPhone app, where web push doesn't exist. */
    inApp: boolean;
  };
  /** Null inside the apps or until it has been read. */
  browserDevice: BrowserDeviceState | null;
  /** The InFocus app's own notification state ("Mac app", its tag, a failed action); null on the web. */
  app: { device: string; tag: SettingsNavStatus | null; error: boolean } | null;
  profileError: boolean;
  pins: { visible: boolean; anyNotSet: boolean; error: boolean };
  signature: { visible: boolean; hasSignature: boolean; error: boolean };
};

type SettingsNavStatuses = Partial<Record<SettingsSectionId, SettingsNavStatus | null>>;

export type AttentionItem = { id: SettingsSectionId; text: string; tone: "warn" | "danger" };

const ERROR: SettingsNavStatus = { label: "Error", tone: "danger" };
const ON: SettingsNavStatus = { label: "On", tone: "ok" };
const OFF: SettingsNavStatus = { label: "Off", tone: "warn" };

/**
 * The Browser card's tag: only what the switch can't show. Whether this browser holds a push
 * subscription is never flagged: Browser is one account-wide switch, and turning it off removes
 * every device, so there's nothing safe to suggest for a device that isn't subscribed.
 */
export function browserDeviceTag(device: BrowserDeviceState | null): SettingsNavStatus | null {
  if (device === "unsupported") return { label: "Unsupported", tone: "neutral" };
  if (device === "blocked") return { label: "Blocked", tone: "warn" };
  return null;
}

/** A warning about this device that matters right now (Browser on but blocked here; the app not set up). */
function deviceWarning({ notifications, browserDevice, app }: SettingsStatusInput): SettingsNavStatus | null {
  const tag = notifications.inApp
    ? (app?.tag ?? null)
    : notifications.browserEnabled
      ? browserDeviceTag(browserDevice)
      : null;
  return tag?.tone === "warn" ? tag : null;
}

function anyChannelOn({ notifications }: SettingsStatusInput) {
  return notifications.emailEnabled || (!notifications.inApp && notifications.browserEnabled);
}

function notificationsStatus(input: SettingsStatusInput): SettingsNavStatus | null {
  if (input.notifications.error || input.app?.error) return ERROR;
  if (!input.notifications.loaded) return null;
  if (!anyChannelOn(input)) return OFF;
  return deviceWarning(input) ?? ON;
}

export function settingsNavStatuses(input: SettingsStatusInput): SettingsNavStatuses {
  return {
    notifications: notificationsStatus(input),
    profile: input.profileError ? ERROR : null,
    pins: !input.pins.visible
      ? null
      : input.pins.error
        ? ERROR
        : input.pins.anyNotSet
          ? { label: "Not set", tone: "neutral" }
          : null,
    signature: !input.signature.visible
      ? null
      : input.signature.error
        ? ERROR
        : input.signature.hasSignature
          ? null
          : { label: "Not set", tone: "warn" }
  };
}

/** Warnings and errors worth a line in the page header (the phone strip can hide them off-screen). */
export function settingsAttention(input: SettingsStatusInput): AttentionItem[] {
  const { notifications, app, pins, signature } = input;
  const settled = notifications.loaded && !notifications.error;
  const device = settled && anyChannelOn(input) ? deviceWarning(input) : null;

  const candidates: Array<AttentionItem | false> = [
    (notifications.error || Boolean(app?.error)) && { id: "notifications", text: "Notifications need attention", tone: "danger" },
    settled && !anyChannelOn(input) && { id: "notifications", text: "Notifications are off", tone: "warn" },
    device !== null && {
      id: "notifications",
      text: notifications.inApp
        ? `${app?.device ?? "App"} notifications: ${device.label.toLowerCase()}`
        : "Browser notifications are blocked on this device",
      tone: "warn"
    },
    input.profileError && { id: "profile", text: "Profile needs attention", tone: "danger" },
    pins.visible && pins.error && { id: "pins", text: "PINs need attention", tone: "danger" },
    signature.visible && signature.error && { id: "signature", text: "Signature needs attention", tone: "danger" },
    signature.visible &&
      !signature.error &&
      !signature.hasSignature && { id: "signature", text: "Signature not set", tone: "warn" }
  ];
  return candidates.filter((item): item is AttentionItem => Boolean(item));
}
