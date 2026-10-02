/** Talks to the InFocus Mac and iPhone apps from Portal pages (WKWebView message handler named "infocus"). */

export type MacNotificationPermission = "authorized" | "denied" | "notDetermined" | "provisional";
export type MacNotificationStatus = { permission: MacNotificationPermission; registered: boolean; appVersion: string };
export type MacAppAction = "notificationStatus" | "requestNotifications" | "openNotificationSettings";

type MacAppHandler = { postMessage(body: { action: MacAppAction }): Promise<unknown> };

const PERMISSIONS: readonly MacNotificationPermission[] = ["authorized", "denied", "notDetermined", "provisional"];

/** Which InFocus app a Portal page runs in. */
export type PortalAppDevice = "mac" | "iphone";

export function portalAppDevice(userAgent: string): PortalAppDevice | null {
  if (/InFocusMacApp/i.test(userAgent)) return "mac";
  if (/InFocusiOSApp/i.test(userAgent)) return "iphone";
  return null;
}

/** The latest notarized InFocus for Mac (the zip keeps its old name so older copies can update). */
export const MAC_APP_DOWNLOAD_URL =
  "https://github.com/neelsatyavolu/infocus-drive/releases/latest/download/InFocus-Drive-mac.zip";

export type MacAppAudience = "app" | "mac" | "other";

/** Who is looking at the install card. iPadOS Safari also says "Macintosh"; only a Mac has no touch screen. */
export function macAppAudience(userAgent: string, maxTouchPoints: number): MacAppAudience {
  if (portalAppDevice(userAgent) === "mac") return "app";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints <= 1) return "mac";
  return "other";
}

function macAppHandler(): MacAppHandler | null {
  if (typeof window === "undefined") return null;
  const webkit = (window as unknown as { webkit?: { messageHandlers?: { infocus?: MacAppHandler } } }).webkit;
  return webkit?.messageHandlers?.infocus ?? null;
}

export async function callMacApp(action: MacAppAction): Promise<unknown> {
  const handler = macAppHandler();
  if (!handler) throw new Error("The InFocus app isn't responding. Restart it and try again.");
  return handler.postMessage({ action });
}

export function parseMacNotificationStatus(value: unknown): MacNotificationStatus | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const permission = PERMISSIONS.find((entry) => entry === record.permission);
  if (!permission || typeof record.registered !== "boolean") return null;
  return { permission, registered: record.registered, appVersion: typeof record.appVersion === "string" ? record.appVersion : "" };
}

/** One line under the app notifications heading. */
export function macNotificationStatusText(status: MacNotificationStatus, device: PortalAppDevice = "mac") {
  if (device === "iphone") {
    if (status.permission === "denied") return "Off in iPhone Settings. Turn on notifications for InFocus Portal there.";
    if (status.permission === "notDetermined") return "Not set up yet. Turn them on to get an iPhone notification whenever Portal emails you.";
    if (!status.registered) return "Allowed, but this iPhone isn't registered with Portal yet. If this doesn't change, reopen the app.";
    return "On. You get an iPhone notification whenever Portal emails you.";
  }
  if (status.permission === "denied") return "Off in macOS settings. Turn on notifications for InFocus there.";
  if (status.permission === "notDetermined") return "Not set up yet. Turn them on to get a Mac notification whenever Portal emails you.";
  if (!status.registered) return "Allowed, but this Mac isn't registered with Portal yet. If this doesn't change, restart the app.";
  return "On. You get a Mac notification whenever Portal emails you.";
}
