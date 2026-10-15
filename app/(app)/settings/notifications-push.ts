import type { BrowserDeviceState } from "./settings-status";

/** Web push plumbing for Settings → Notifications → Browser (moved here unchanged). */

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function canUseWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function readPushPublicKey() {
  const response = await fetch("/api/push/public-key", { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok || !payload.data) {
    throw new Error(payload?.error?.message ?? "Failed to load web push configuration.");
  }

  const data = payload.data as {
    configured: boolean;
    publicKey: string | null;
  };

  if (!data.configured || !data.publicKey) {
    throw new Error("Web push is not configured on the server yet.");
  }

  return data.publicKey;
}

export function extractSubscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Could not read browser push subscription keys.");
  }

  return {
    endpoint,
    keys: {
      p256dh,
      auth
    }
  };
}

/**
 * Whether this browser can get Portal push notifications right now. Read-only: it never asks for
 * permission and never registers anything (getRegistration/getSubscription only look).
 */
export async function readBrowserDevice(): Promise<BrowserDeviceState> {
  if (!canUseWebPush()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? "subscribed" : "unsubscribed";
  } catch {
    return "unknown";
  }
}
