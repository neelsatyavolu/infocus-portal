"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AppearanceCard } from "./appearance-card";
import { ClassBoardPinCard } from "./class-board-pin-card";

type PreferenceState = {
  autoPlay: boolean;
  soundEnabled: boolean;
  defaultView: "grid" | "list";
};

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
type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type MacNotificationRuntimeInfo = {
  isDev: boolean;
  permissionPromptOwner: string;
  resetCommand: string;
};

const STORAGE_KEY = "infocus-settings";

const defaults: PreferenceState = {
  autoPlay: false,
  soundEnabled: true,
  defaultView: "grid"
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

function getTauriInvoke() {
  if (typeof window === "undefined") {
    return null;
  }

  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } }).__TAURI__;
  return tauri?.core?.invoke ?? null;
}

function isMacDesktopShell() {
  return typeof window !== "undefined" && /InFocusMacApp/i.test(window.navigator.userAgent);
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

export default function SettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<PreferenceState>(defaults);
  const [savedLabel, setSavedLabel] = useState("");
  const [channels, setChannels] = useState<NotificationChannelState>(defaultChannels);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsSaving, setChannelsSaving] = useState(false);
  const [channelsSavedLabel, setChannelsSavedLabel] = useState("");
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [browserEnableModalOpen, setBrowserEnableModalOpen] = useState(false);
  const [notificationEmailInput, setNotificationEmailInput] = useState("");
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [isMacDesktopApp, setIsMacDesktopApp] = useState(false);
  const [macPushEnabled, setMacPushEnabled] = useState(false);
  const [macPushLoading, setMacPushLoading] = useState(false);
  const [macPushSaving, setMacPushSaving] = useState(false);
  const [macPushSavedLabel, setMacPushSavedLabel] = useState("");
  const [macPushError, setMacPushError] = useState<string | null>(null);
  const [macRuntimeInfo, setMacRuntimeInfo] = useState<MacNotificationRuntimeInfo | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [profileGoogleName, setProfileGoogleName] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedLabel, setProfileSavedLabel] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);

      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const payload = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "Failed to load profile.");
        }

        const data = payload.data as { email: string | null; name: string | null; nickname: string | null };
        setProfileEmail(data.email);
        setProfileGoogleName(data.name);
        setNicknameInput(data.nickname ?? "");
      } catch (error) {
        if (!active) {
          return;
        }

        setProfileError(error instanceof Error ? error.message : "Failed to load profile.");
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PreferenceState;
      setPrefs({
        autoPlay: Boolean(parsed.autoPlay),
        soundEnabled: Boolean(parsed.soundEnabled),
        defaultView: parsed.defaultView === "list" ? "list" : "grid"
      });
    } catch {
      // ignore invalid local preferences
    }
  }, []);

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
    const macDesktop = isMacDesktopShell();
    setIsMacDesktopApp(macDesktop);

    if (!macDesktop) {
      return;
    }

    let active = true;

    async function loadMacPushState() {
      setMacPushLoading(true);
      setMacPushError(null);

      const invoke = getTauriInvoke();
      if (!invoke) {
        setMacPushError("Mac app bridge is unavailable. Restart the app and try again.");
        setMacPushLoading(false);
        return;
      }

      try {
        const runtimeInfoRaw = await invoke("get_mac_notification_runtime_info");
        if (active) {
          setMacRuntimeInfo((runtimeInfoRaw ?? null) as MacNotificationRuntimeInfo | null);
        }

        const enabled = await invoke("get_mac_push_enabled");
        if (!active) {
          return;
        }

        setMacPushEnabled(Boolean(enabled));
      } catch (error) {
        if (!active) {
          return;
        }

        setMacPushError(error instanceof Error ? error.message : "Could not read Mac app notification settings.");
      } finally {
        if (active) {
          setMacPushLoading(false);
        }
      }
    }

    void loadMacPushState();

    return () => {
      active = false;
    };
  }, []);

  async function saveNickname() {
    setProfileSaving(true);
    setProfileError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nicknameInput.trim() || null })
      });
      const payload = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "Failed to save nickname.");
      }

      const data = payload.data as { email: string | null; name: string | null; nickname: string | null };
      setProfileEmail(data.email);
      setProfileGoogleName(data.name);
      setNicknameInput(data.nickname ?? "");
      setProfileSavedLabel("Saved");
      router.refresh();
      window.setTimeout(() => setProfileSavedLabel(""), 1200);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Failed to save nickname.");
    } finally {
      setProfileSaving(false);
    }
  }

  function save(next: PreferenceState) {
    setPrefs(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSavedLabel("Saved");
    window.setTimeout(() => setSavedLabel(""), 1200);
  }

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

  async function onMacPushToggle(nextValue: boolean) {
    if (!isMacDesktopApp) {
      return;
    }

    setMacPushSaving(true);
    setMacPushError(null);

    const invoke = getTauriInvoke();
    if (!invoke) {
      setMacPushError("Mac app bridge is unavailable. Restart the app and try again.");
      setMacPushSaving(false);
      return;
    }

    try {
      const result = await invoke("set_mac_push_enabled", { enabled: nextValue });
      const enabled = Boolean(result);

      if (nextValue && !enabled) {
        setMacPushEnabled(false);
        setMacPushError(
          "Notifications were not enabled. Allow notifications for InFocus Portal in macOS System Settings and try again."
        );
        return;
      }

      setMacPushEnabled(nextValue);
      setMacPushSavedLabel(nextValue ? "Mac notifications enabled" : "Mac notifications disabled");
      window.setTimeout(() => setMacPushSavedLabel(""), 1400);
    } catch (error) {
      setMacPushError(error instanceof Error ? error.message : "Could not update Mac app notifications.");
    } finally {
      setMacPushSaving(false);
    }
  }

  async function sendMacTestNotification() {
    if (!isMacDesktopApp) {
      return;
    }

    setMacPushError(null);

    const invoke = getTauriInvoke();
    if (!invoke) {
      setMacPushError("Mac app bridge is unavailable. Restart the app and try again.");
      return;
    }

    try {
      await invoke("send_local_notification", {
        title: "InFocus Portal Test Notification",
        body: "Mac app notifications are working."
      });
      setMacPushSavedLabel("Test notification sent");
      window.setTimeout(() => setMacPushSavedLabel(""), 1400);
    } catch (error) {
      setMacPushError(error instanceof Error ? error.message : "Could not send Mac app test notification.");
    }
  }

  async function openMacNotificationSettings() {
    if (!isMacDesktopApp) {
      return;
    }

    setMacPushError(null);

    const invoke = getTauriInvoke();
    if (!invoke) {
      setMacPushError("Mac app bridge is unavailable. Restart the app and try again.");
      return;
    }

    try {
      await invoke("open_mac_notification_settings");
    } catch (error) {
      setMacPushError(error instanceof Error ? error.message : "Could not open macOS Notification settings.");
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

  async function saveNotificationEmail() {
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

  return (
    <div className="route-enter mx-auto w-full max-w-5xl space-y-5">
      <section className="brand-hero-panel relative overflow-hidden p-5 md:p-6">
        <div className="relative min-w-0">
          <div className="eyebrow">Account</div>
          <h1 className="display-md mt-2 text-foreground">Settings</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Nickname, appearance, playback, notifications, and quick links to the grades and teleprompter apps.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">Nickname</p>
        <p className="text-xs text-muted-foreground">
          This is how you appear in InFocus. Signing in with Google will not overwrite it.
        </p>
        {profileGoogleName || profileEmail ? (
          <p className="text-xs text-muted-foreground">
            Google account{profileGoogleName ? `: ${profileGoogleName}` : ""}
            {profileEmail ? ` · ${profileEmail}` : ""}
          </p>
        ) : null}
        <div className="flex gap-2">
          <input
            value={nicknameInput}
            onChange={(event) => setNicknameInput(event.target.value)}
            placeholder="What should we call you?"
            maxLength={60}
            disabled={profileLoading || profileSaving}
            className="h-10 flex-1 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            onClick={() => void saveNickname()}
            disabled={profileLoading || profileSaving}
            className="rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {profileSaving ? "Saving..." : "Save"}
          </button>
        </div>
        {profileLoading ? <p className="text-xs text-muted-foreground">Loading profile...</p> : null}
        {profileSavedLabel ? <p className="text-xs text-foreground">{profileSavedLabel}</p> : null}
        {profileError ? <p className="text-xs text-amber-300">{profileError}</p> : null}
      </section>

      <AppearanceCard />

      <ClassBoardPinCard />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">Apps & schedule</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href="https://grades.infocuspaly.com"
            className="rounded-lg border border-border bg-muted p-3 text-sm transition hover:bg-accent"
          >
            <div className="font-semibold text-foreground">Grades dashboard</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estimated grade, participation, packages, and calculator · grades.infocuspaly.com
            </p>
          </a>
          <a
            href="https://teleprompter.infocuspaly.com"
            className="rounded-lg border border-border bg-muted p-3 text-sm transition hover:bg-accent"
          >
            <div className="font-semibold text-foreground">Teleprompter</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fullscreen run mode + AI reformat · teleprompter.infocuspaly.com
            </p>
          </a>
          <a
            href="https://drive.infocuspaly.com"
            className="rounded-lg border border-border bg-muted p-3 text-sm transition hover:bg-accent"
          >
            <div className="font-semibold text-foreground">InFocus Drive</div>
            <p className="mt-0.5 text-xs text-muted-foreground">Media storage · drive.infocuspaly.com</p>
          </a>
          <div className="rounded-lg border border-border bg-muted p-3 text-sm">
            <div className="font-semibold text-foreground">Weekly schedule</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Mon PA · Tue/Thu class · Wed/Fri shows · holidays off (PAUSD calendar seeded)
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">Playback & Layout</p>

        <label className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
          <span>Autoplay videos on open</span>
          <Switch
            checked={prefs.autoPlay}
            onCheckedChange={(next) => save({ ...prefs, autoPlay: next })}
            aria-label="Autoplay videos on open"
          />
        </label>

        <label className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
          <span>Start with sound enabled</span>
          <Switch
            checked={prefs.soundEnabled}
            onCheckedChange={(next) => save({ ...prefs, soundEnabled: next })}
            aria-label="Start with sound enabled"
          />
        </label>

        <div className="rounded-lg border border-border bg-muted p-3">
          <p className="mb-2 text-sm text-foreground">Default view</p>
          <div className="inline-flex rounded-lg border border-border bg-secondary p-1 text-sm">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${prefs.defaultView === "grid" ? "bg-background text-foreground" : "text-muted-foreground"}`}
              onClick={() => save({ ...prefs, defaultView: "grid" })}
            >
              Grid
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${prefs.defaultView === "list" ? "bg-background text-foreground" : "text-muted-foreground"}`}
              onClick={() => save({ ...prefs, defaultView: "list" })}
            >
              List
            </button>
          </div>
        </div>

        {savedLabel ? <p className="text-xs text-muted-foreground">{savedLabel}</p> : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">Notification Channels</p>

        <article className="rounded-xl border border-border bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <Mail className="h-4 w-4" /> Email notifications
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void sendEmailTestNotification()}
                disabled={channelsLoading || channelsSaving || emailTestSending || !channels.emailEnabled}
                className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                {emailTestSending ? "Sending..." : "Test Email"}
              </button>
              <Switch
                checked={channels.emailEnabled}
                onCheckedChange={(next) => void saveChannels({ ...channels, emailEnabled: next })}
                aria-label="Email notifications"
                disabled={channelsLoading || channelsSaving || emailTestSending}
              />
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Notification email destination (optional). Leave blank to use your account email.
            </p>
            <div className="flex gap-2">
              <input
                value={notificationEmailInput}
                onChange={(event) => setNotificationEmailInput(event.target.value)}
                placeholder="notifications@example.com"
                className="h-10 flex-1 rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={() => void saveNotificationEmail()}
                disabled={channelsLoading || channelsSaving}
                className="rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(["announcements", "comments", "grades"] as CategoryKey[]).map((category) => {
              const key = preferenceKeyMap.email[category];
              return (
                <label key={`email-${category}`} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground">
                  <span>{categoryLabels[category]}</span>
                  <Switch
                    checked={Boolean(channels[key])}
                    onCheckedChange={(next) => updateCategoryPreference("email", category, next)}
                    aria-label={`Email ${categoryLabels[category]}`}
                    disabled={channelsLoading || channelsSaving}
                  />
                </label>
              );
            })}
          </div>
        </article>

        <article className="rounded-xl border border-border bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-sm text-foreground">
              <BellRing className="h-4 w-4" /> Browser notifications
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void sendBrowserTestNotification()}
                disabled={channelsLoading || channelsSaving || !channels.browserEnabled}
                className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                Test Notification
              </button>
              <Switch
                checked={channels.browserEnabled}
                onCheckedChange={(next) => void onBrowserToggle(next)}
                aria-label="Browser notifications"
                disabled={channelsLoading || channelsSaving}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(["announcements", "comments", "grades"] as CategoryKey[]).map((category) => {
              const key = preferenceKeyMap.browser[category];
              return (
                <label key={`browser-${category}`} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground">
                  <span>{categoryLabels[category]}</span>
                  <Switch
                    checked={Boolean(channels[key])}
                    onCheckedChange={(next) => updateCategoryPreference("browser", category, next)}
                    aria-label={`Browser ${categoryLabels[category]}`}
                    disabled={channelsLoading || channelsSaving}
                  />
                </label>
              );
            })}
          </div>
        </article>

        {isMacDesktopApp ? (
          <article className="rounded-xl border border-border bg-muted p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 text-sm text-foreground">
                <BellRing className="h-4 w-4" /> Mac app notifications
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void sendMacTestNotification()}
                  disabled={macPushLoading || macPushSaving || !macPushEnabled}
                  className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                >
                  Test Notification
                </button>
                <Switch
                  checked={macPushEnabled}
                  onCheckedChange={(next) => void onMacPushToggle(next)}
                  aria-label="Mac app notifications"
                  disabled={macPushLoading || macPushSaving}
                />
              </div>
            </div>
            {macRuntimeInfo?.isDev ? (
              <p className="mt-3 text-xs text-amber-200">
                Running in `tauri dev`: macOS treats notification permission under {macRuntimeInfo.permissionPromptOwner},
                so Apple may not show a new prompt for InFocus Portal in dev mode.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              When enabled, closing the app lets you keep it in the background so notifications can continue.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void openMacNotificationSettings()}
                className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground"
              >
                Open Mac Notification Settings
              </button>
            </div>
          </article>
        ) : null}

        {channelsLoading ? <p className="text-xs text-muted-foreground">Loading notification preferences...</p> : null}
        {channelsSavedLabel ? <p className="text-xs text-foreground">{channelsSavedLabel}</p> : null}
        {channelsError ? <p className="text-xs text-amber-300">{channelsError}</p> : null}
        {macPushLoading ? <p className="text-xs text-muted-foreground">Loading Mac app notification preference...</p> : null}
        {macPushSavedLabel ? <p className="text-xs text-foreground">{macPushSavedLabel}</p> : null}
        {macPushError ? <p className="text-xs text-amber-300">{macPushError}</p> : null}
      </section>

      <Dialog open={browserEnableModalOpen} onOpenChange={setBrowserEnableModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Browser Notifications</DialogTitle>
            <DialogDescription>Make sure notifications are enabled in both your browser and your device settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-foreground">
            <p>1. Allow notifications for this site when your browser prompts you.</p>
            <p>2. In your browser settings, confirm notifications are allowed for this website.</p>
            <p>3. In your device settings (Mac/Windows/iOS/Android), make sure notifications for your browser are enabled.</p>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setBrowserEnableModalOpen(false)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              Got it
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
