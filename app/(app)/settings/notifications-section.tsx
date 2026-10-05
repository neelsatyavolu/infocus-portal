"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  SaveStatus,
  SettingsNotice,
  SettingsPanel,
  SettingsRow,
  SettingsSection
} from "@/components/settings-layout";
import { portalAppDevice, type PortalAppDevice } from "@/src/lib/mac-app-bridge";
import { MacNotificationsRow } from "./mac-notifications-card";

type NotificationChannelState = {
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

type ChannelKey = "email" | "browser";
type CategoryKey = "announcements" | "comments" | "grades";

const CATEGORIES: CategoryKey[] = ["announcements", "comments", "grades"];

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

const categoryLabels: Record<CategoryKey, string> = {
  announcements: "Announcements",
  comments: "Comments",
  grades: "Grades"
};

const preferenceKeyMap: Record<ChannelKey, Record<CategoryKey, keyof NotificationChannelState>> = {
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function canUseWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function readPushPublicKey() {
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

function extractSubscriptionPayload(subscription: PushSubscription) {
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

/** Settings → Notifications: channels (email, browser or the InFocus app) and what each one sends. */
export function NotificationsSection({ accountEmail }: { accountEmail: string | null }) {
  const [channels, setChannels] = useState<NotificationChannelState>(defaultChannels);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsSaving, setChannelsSaving] = useState(false);
  const [channelsSavedLabel, setChannelsSavedLabel] = useState("");
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [browserEnableModalOpen, setBrowserEnableModalOpen] = useState(false);
  const [notificationEmailInput, setNotificationEmailInput] = useState("");
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [appDevice, setAppDevice] = useState<PortalAppDevice | null>(null);

  useEffect(() => {
    let active = true;

    async function loadChannels() {
      setChannelsLoading(true);
      setChannelsError(null);

      try {
        const response = await fetch("/api/notification-preferences", { cache: "no-store" });
        const payload = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "Failed to load notification channels.");
        }

        const data = payload.data as NotificationChannelState;
        setChannels({
          ...defaultChannels,
          ...data
        });
        setNotificationEmailInput(data.notificationEmail ?? "");
      } catch (error) {
        if (!active) {
          return;
        }

        setChannelsError(error instanceof Error ? error.message : "Failed to load notification channels.");
      } finally {
        if (active) {
          setChannelsLoading(false);
        }
      }
    }

    void loadChannels();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setAppDevice(portalAppDevice(window.navigator.userAgent));
  }, []);

  async function saveChannels(next: NotificationChannelState) {
    const previous = channels;

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

      const data = payload.data as NotificationChannelState;
      setChannels({
        ...defaultChannels,
        ...data
      });
      setNotificationEmailInput(data.notificationEmail ?? "");
      setChannelsSavedLabel("Saved");
      window.setTimeout(() => setChannelsSavedLabel(""), 1200);
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

      setChannelsSavedLabel("Test email sent");
      window.setTimeout(() => setChannelsSavedLabel(""), 1200);
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
      setChannelsError("Enter a valid notification email address.");
      return;
    }

    await saveChannels({
      ...channels,
      notificationEmail: nextValue || null
    });
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
  // Web push doesn't exist inside the apps' web views; app notifications replace it there.
  const columns: ChannelKey[] = appDevice ? ["email"] : ["email", "browser"];
  const emailDestination = channels.notificationEmail || accountEmail;

  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      description="Where Portal reaches you, and what it sends."
      actions={<SaveStatus text={channelsLoading ? "Loading…" : channelsSavedLabel} pending={channelsLoading} />}
    >
      {channelsError ? (
        <SettingsNotice tone="error" onDismiss={() => setChannelsError(null)}>
          {channelsError}
        </SettingsNotice>
      ) : null}

      <SettingsPanel>
        <SettingsRow
          title="Email"
          description={emailDestination ? `Sent to ${emailDestination}.` : "Sent to your account email."}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void sendEmailTestNotification()}
            disabled={busy || emailTestSending || !channels.emailEnabled}
          >
            {emailTestSending ? "Sending…" : "Send test"}
          </Button>
          <Switch
            checked={channels.emailEnabled}
            onCheckedChange={(next) => void saveChannels({ ...channels, emailEnabled: next })}
            aria-label="Email notifications"
            disabled={busy || emailTestSending}
          />
        </SettingsRow>

        <SettingsRow
          title="Send email to another address"
          description="Optional. Leave blank to use your account email."
          htmlFor="notification-email"
        >
          <form onSubmit={saveNotificationEmail} className="flex w-full gap-2 sm:w-auto">
            <Input
              id="notification-email"
              type="email"
              value={notificationEmailInput}
              onChange={(event) => setNotificationEmailInput(event.target.value)}
              placeholder="notifications@example.com"
              className="sm:w-64"
            />
            <Button type="submit" variant="outline" disabled={busy}>
              Save
            </Button>
          </form>
        </SettingsRow>

        {appDevice ? (
          <MacNotificationsRow device={appDevice} />
        ) : (
          <SettingsRow
            title="Browser"
            description="Pop-up notifications on this device. Turn it on for each device you use."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void sendBrowserTestNotification()}
              disabled={busy || !channels.browserEnabled}
            >
              Send test
            </Button>
            <Switch
              checked={channels.browserEnabled}
              onCheckedChange={(next) => void onBrowserToggle(next)}
              aria-label="Browser notifications"
              disabled={busy}
            />
          </SettingsRow>
        )}
      </SettingsPanel>

      <SettingsPanel>
        <table className="w-full text-sm">
          <caption className="sr-only">What each channel sends</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground md:px-5">
                Send me
              </th>
              {columns.map((channel) => (
                <th
                  key={channel}
                  scope="col"
                  className="w-24 px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground md:w-28"
                >
                  {channel === "email" ? "Email" : "Browser"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CATEGORIES.map((category) => (
              <tr key={category}>
                <th scope="row" className="px-4 py-3 text-left font-normal text-foreground md:px-5">
                  {categoryLabels[category]}
                </th>
                {columns.map((channel) => (
                  <td key={channel} className="px-4 py-3 text-center">
                    <Switch
                      checked={Boolean(channels[preferenceKeyMap[channel][category]])}
                      onCheckedChange={(next) => updateCategoryPreference(channel, category, next)}
                      aria-label={`${channel === "email" ? "Email" : "Browser"} ${categoryLabels[category]}`}
                      disabled={busy}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </SettingsPanel>

      <Dialog open={browserEnableModalOpen} onOpenChange={setBrowserEnableModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable browser notifications</DialogTitle>
            <DialogDescription>Make sure notifications are enabled in both your browser and your device settings.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
            <li>Allow notifications for this site when your browser prompts you.</li>
            <li>In your browser settings, confirm notifications are allowed for this website.</li>
            <li>In your device settings (Mac/Windows/iOS/Android), make sure notifications for your browser are enabled.</li>
          </ol>
          <DialogFooter>
            <Button type="button" onClick={() => setBrowserEnableModalOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
