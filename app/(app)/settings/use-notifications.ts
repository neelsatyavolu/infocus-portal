"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { portalAppDevice, type PortalAppDevice } from "@/src/lib/mac-app-bridge";
import {
  canUseWebPush,
  extractSubscriptionPayload,
  readBrowserDevice,
  readPushPublicKey,
  urlBase64ToUint8Array
} from "./notifications-push";
import type { BrowserDeviceState } from "./settings-status";
import { useSavedFlash } from "./use-saved-flash";

export type NotificationChannelState = {
  emailEnabled: boolean;
  notificationEmail: string | null;
  browserEnabled: boolean;
  emailAnnouncementsEnabled: boolean;
  emailCommentsEnabled: boolean;
  emailGradesEnabled: boolean;
  browserAnnouncementsEnabled: boolean;
  browserCommentsEnabled: boolean;
  browserGradesEnabled: boolean;
};

export type ChannelKey = "email" | "browser";
type CategoryKey = "announcements" | "comments" | "grades";

export const CATEGORIES: CategoryKey[] = ["announcements", "comments", "grades"];

export const categoryLabels: Record<CategoryKey, string> = {
  announcements: "Announcements",
  comments: "Comments",
  grades: "Grades"
};

export const preferenceKeyMap: Record<ChannelKey, Record<CategoryKey, keyof NotificationChannelState>> = {
  email: {
    announcements: "emailAnnouncementsEnabled",
    comments: "emailCommentsEnabled",
    grades: "emailGradesEnabled"
  },
  browser: {
    announcements: "browserAnnouncementsEnabled",
    comments: "browserCommentsEnabled",
    grades: "browserGradesEnabled"
  }
};

const defaultChannels: NotificationChannelState = {
  emailEnabled: true,
  notificationEmail: null,
  browserEnabled: false,
  emailAnnouncementsEnabled: true,
  emailCommentsEnabled: true,
  emailGradesEnabled: false,
  browserAnnouncementsEnabled: true,
  browserCommentsEnabled: true,
  browserGradesEnabled: false
};

/** Last-seen preferences (src/lib/client-cache.ts), so returning to Settings shows them at once. */
const CACHE_KEY = "settings:notification-preferences";
const LOAD_ERROR = "Failed to load notification channels.";

function noopSubscribe() {
  return () => undefined;
}

/**
 * Which InFocus app this page runs in: `undefined` until the browser is known (server render and
 * hydration), `null` on the web. Read during render on client navigations, so the Browser card
 * never flashes inside the apps.
 */
function useAppDevice(): PortalAppDevice | null | undefined {
  return useSyncExternalStore(
    noopSubscribe,
    () => portalAppDevice(window.navigator.userAgent),
    () => undefined
  );
}

/**
 * Settings → Notifications state: GET/PUT /api/notification-preferences, the test email, and the
 * browser push flows. Every switch saves the full state at once (optimistic, rolled back on a
 * failure); `busy` disables every switch while a load or a save runs, so a save never sends a
 * remembered copy that a refresh is about to replace.
 */
export function useNotifications() {
  const [cached] = useState(() =>
    typeof window === "undefined" ? undefined : cachedValue<NotificationChannelState>(CACHE_KEY)
  );
  const [channels, setChannels] = useState<NotificationChannelState>(cached ?? defaultChannels);
  /** Real preferences are on screen (from the server, or the last copy this tab saw). */
  const [loaded, setLoaded] = useState(Boolean(cached));
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsSaving, setChannelsSaving] = useState(false);
  const [channelsSavedLabel, flashChannelsSaved] = useSavedFlash();
  const [channelsError, setChannelsError] = useState<string | null>(null);
  /** A typo in the address: shown under the field, not as a section error. */
  const [notificationEmailError, setNotificationEmailError] = useState<string | null>(null);
  const [browserEnableModalOpen, setBrowserEnableModalOpen] = useState(false);
  const [notificationEmailInput, setNotificationEmailInput] = useState(cached?.notificationEmail ?? "");
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [browserDevice, setBrowserDevice] = useState<BrowserDeviceState | null>(null);
  const appDevice = useAppDevice();

  const mountedRef = useRef(true);
  /** The address the server has; the input only follows it while the person isn't editing. */
  const savedEmailRef = useRef(cached?.notificationEmail ?? "");
  /** Bumped by every save, so a slower refresh that started earlier can't undo it. */
  const saveSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyServer = useCallback((data: NotificationChannelState, replaceInput = false) => {
    const next = { ...defaultChannels, ...data };
    const previousSaved = savedEmailRef.current;
    const nextSaved = data.notificationEmail ?? "";
    savedEmailRef.current = nextSaved;
    rememberValue(CACHE_KEY, next);
    setChannels(next);
    setLoaded(true);
    setNotificationEmailInput((current) => (replaceInput || current === previousSaved ? nextSaved : current));
  }, []);

  const loadChannels = useCallback(async () => {
    const seq = saveSeqRef.current;
    setChannelsLoading(true);
    setChannelsError(null);

    try {
      const response = await fetch("/api/notification-preferences", { cache: "no-store" });
      const payload = await response.json();

      if (!mountedRef.current) {
        return;
      }

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? LOAD_ERROR);
      }

      if (seq === saveSeqRef.current) {
        applyServer(payload.data as NotificationChannelState);
      }
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setChannelsError(error instanceof Error ? error.message : LOAD_ERROR);
    } finally {
      if (mountedRef.current) {
        setChannelsLoading(false);
      }
    }
  }, [applyServer]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const refreshBrowserDevice = useCallback(async () => {
    if (appDevice !== null) return;
    const next = await readBrowserDevice();
    if (mountedRef.current) setBrowserDevice(next);
  }, [appDevice]);

  useEffect(() => {
    void refreshBrowserDevice();
  }, [refreshBrowserDevice]);

  async function saveChannels(next: NotificationChannelState, replaceInput = false) {
    const previous = channels;

    saveSeqRef.current += 1;
    setChannels(next);
    setChannelsSaving(true);
    setChannelsError(null);

    try {
      const response = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      const payload = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "Failed to save notification settings.");
      }

      applyServer(payload.data as NotificationChannelState, replaceInput);
      flashChannelsSaved("Saved");
      return true;
    } catch (error) {
      setChannels(previous);
      setChannelsError(error instanceof Error ? error.message : "Failed to save notification settings.");
      return false;
    } finally {
      setChannelsSaving(false);
    }
  }

  async function sendBrowserTestNotification() {
    setChannelsError(null);

    try {
      if (!canUseWebPush()) {
        throw new Error("This browser does not support push notifications.");
      }

      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("Browser notifications are blocked. Allow notifications and try again.");
        }
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await registration.showNotification("InFocus Portal Test Notification", {
        body: "Browser notifications are working.",
        icon: "/favicon.ico"
      });
    } catch (error) {
      setChannelsError(error instanceof Error ? error.message : "Failed to send test notification.");
    }
  }

  async function sendEmailTestNotification() {
    setChannelsError(null);
    setEmailTestSending(true);

    try {
      const response = await fetch("/api/notification-preferences/test-email", {
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "Failed to send test email notification.");
      }

      flashChannelsSaved("Test email sent");
    } catch (error) {
      setChannelsError(error instanceof Error ? error.message : "Failed to send test email notification.");
    } finally {
      setEmailTestSending(false);
    }
  }

  function updateCategoryPreference(channel: ChannelKey, category: CategoryKey, checked: boolean) {
    const key = preferenceKeyMap[channel][category];
    void saveChannels({
      ...channels,
      [key]: checked
    });
  }

  async function saveNotificationEmail(event: FormEvent) {
    event.preventDefault();
    const nextValue = notificationEmailInput.trim();

    if (nextValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextValue)) {
      setNotificationEmailError("Enter a valid notification email address.");
      return;
    }

    setNotificationEmailError(null);

    await saveChannels(
      {
        ...channels,
        notificationEmail: nextValue || null
      },
      true
    );
  }

  async function onBrowserToggle(nextValue: boolean) {
    if (!nextValue) {
      if (canUseWebPush()) {
        try {
          const registration = await navigator.serviceWorker.getRegistration("/sw.js");
          const existingSubscription = await registration?.pushManager.getSubscription();
          const endpoint = existingSubscription?.endpoint;

          if (existingSubscription) {
            await existingSubscription.unsubscribe();
          }

          await fetch("/api/push/subscription", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(endpoint ? { endpoint } : {})
          });
        } catch {
          // best effort unsubscribe
        }
      }

      await saveChannels({
        ...channels,
        browserEnabled: false
      });
      return;
    }

    setBrowserEnableModalOpen(true);

    if (!canUseWebPush()) {
      setChannelsError("This browser does not support push notifications.");
      return;
    }

    let permission = Notification.permission;
    if (permission !== "granted") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      setChannelsError("Browser notifications are blocked. Allow notifications in your browser settings and try again.");
      await saveChannels({
        ...channels,
        browserEnabled: false
      });
      return;
    }

    try {
      const publicKey = await readPushPublicKey();
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const nextSubscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(extractSubscriptionPayload(nextSubscription))
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to save browser push subscription.");
      }
    } catch (error) {
      setChannelsError(error instanceof Error ? error.message : "Failed to enable browser notifications.");
      await saveChannels({
        ...channels,
        browserEnabled: false
      });
      return;
    }

    const saved = await saveChannels({
      ...channels,
      browserEnabled: true
    });

    if (saved) {
      await sendBrowserTestNotification();
    }
  }

  const busy = channelsLoading || channelsSaving;

  return {
    channels,
    loaded,
    loading: channelsLoading,
    busy,
    savedLabel: channelsSavedLabel,
    error: channelsError,
    clearError: () => setChannelsError(null),
    browserEnableModalOpen,
    setBrowserEnableModalOpen,
    notificationEmailInput,
    setNotificationEmailInput: (next: string) => {
      setNotificationEmailInput(next);
      setNotificationEmailError(null);
    },
    notificationEmailError,
    emailTestSending,
    appDevice,
    browserDevice,
    retry: () => void loadChannels(),
    setEmailEnabled: (next: boolean) => void saveChannels({ ...channels, emailEnabled: next }),
    toggleBrowser: (next: boolean) =>
      void onBrowserToggle(next).finally(() => {
        void refreshBrowserDevice();
      }),
    updateCategoryPreference,
    saveNotificationEmail,
    sendBrowserTest: () =>
      void sendBrowserTestNotification().finally(() => {
        void refreshBrowserDevice();
      }),
    sendEmailTest: () => void sendEmailTestNotification()
  };
}

export type NotificationsState = ReturnType<typeof useNotifications>;
