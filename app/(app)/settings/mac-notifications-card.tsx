"use client";

import { useEffect, useState } from "react";
import { InlineError } from "@/components/kit/alert";
import { Skeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { SaveStatus, type SettingsNavStatus } from "@/components/settings-layout";
import {
  callMacApp,
  macNotificationStatusText,
  parseMacNotificationStatus,
  type MacNotificationStatus,
  type PortalAppDevice
} from "@/src/lib/mac-app-bridge";
import { ChannelCard, SendMeLabel } from "./channel-card";
import { useSavedFlash } from "./use-saved-flash";
import { CATEGORIES, categoryLabels, preferenceKeyMap, type NotificationChannelState } from "./use-notifications";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const WORDS: Record<PortalAppDevice, { device: string; system: string; settings: string }> = {
  mac: { device: "Mac", system: "macOS", settings: "System Settings" },
  iphone: { device: "iPhone", system: "iOS", settings: "Settings" }
};

/** Only the exceptions: an allowed, registered device needs no tag (the status line says On). */
function appTag(status: MacNotificationStatus | null): SettingsNavStatus | null {
  if (!status) return null;
  if (status.permission === "denied") return { label: "Blocked", tone: "warn" };
  if (status.permission === "notDetermined") return { label: "Not set up", tone: "warn" };
  if (!status.registered) return { label: "Not registered", tone: "warn" };
  return null;
}

/**
 * The InFocus Mac or iPhone app's notification state (Apple Push, registered by the app). Lives
 * on the page, not in the card, so the rail and the header can show the same status. Does nothing
 * on the web (`device` null) or before the browser is known (`undefined`).
 */
export function useAppNotifications(device: PortalAppDevice | null | undefined) {
  const words = device ? WORDS[device] : null;
  const [status, setStatus] = useState<MacNotificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, flashMessage] = useSavedFlash(1400);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!words) return;
    let active = true;
    callMacApp("notificationStatus")
      .then((value) => {
        if (active) setStatus(parseMacNotificationStatus(value));
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, `Could not read ${words.device} notification settings.`));
      });
    return () => {
      active = false;
    };
  }, [words]);

  async function run(action: "notificationStatus" | "requestNotifications") {
    const next = parseMacNotificationStatus(await callMacApp(action));
    if (!next) throw new Error("The InFocus app sent an unexpected reply. Update the app and try again.");
    setStatus(next);
    return next;
  }

  async function turnOn() {
    if (!words) return;
    setBusy(true);
    setError(null);
    try {
      const next = await run("requestNotifications");
      if (next.permission === "denied") setError(`${words.system} blocked notifications for InFocus. Turn them on in ${words.settings}.`);
    } catch (caught) {
      setError(errorMessage(caught, `Could not turn on ${words.device} notifications.`));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/push/native-device/test", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Could not send a test notification.");
      flashMessage("Test notification sent");
    } catch (caught) {
      setError(errorMessage(caught, "Could not send a test notification."));
    } finally {
      setBusy(false);
    }
  }

  async function openSettings() {
    if (!words) return;
    setError(null);
    try {
      await callMacApp("openNotificationSettings");
    } catch (caught) {
      setError(errorMessage(caught, `Could not open ${words.system} notification settings.`));
    }
  }

  return {
    device: device ?? null,
    status,
    busy,
    message,
    error,
    tag: appTag(status),
    turnOn: () => void turnOn(),
    sendTest: () => void sendTest(),
    openSettings: () => void openSettings()
  };
}

export type AppNotificationsState = ReturnType<typeof useAppNotifications>;

/**
 * The app follows the email settings, so its Send me row mirrors the Email card read-only (tags,
 * not switches) with the same rows, so both lists line up across the cards. `email` is null until
 * the preferences load; the rows then show placeholders instead of defaults.
 */
function FollowsEmailList({ email }: { email: NotificationChannelState | null }) {
  const labelId = "notify-app-send-me";
  return (
    <div role="group" aria-labelledby={labelId}>
      <SendMeLabel id={labelId} note={!email || email.emailEnabled ? "same as Email" : "when Email is on"} />
      <ul className="mt-1 divide-y divide-border">
        {CATEGORIES.map((category) => {
          const on = Boolean(email?.[preferenceKeyMap.email[category]]);
          return (
            <li key={category} className="flex min-h-11 items-center justify-between gap-4 text-sm text-foreground">
              <span className="min-w-0 flex-1 py-2.5">{categoryLabels[category]}</span>
              {email ? (
                <StatusTag size="sm" tone={on ? "ok" : "neutral"}>
                  {on ? "On" : "Off"}
                </StatusTag>
              ) : (
                <Skeleton className="h-[18px] w-8" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Settings → Notifications card shown only inside the InFocus Mac or iPhone app, in place of the
 * Browser card. Turn on sits where the other cards keep their switch; the footer keeps the two
 * outline buttons.
 */
export function MacNotificationsCard({ app, email }: { app: AppNotificationsState; email: NotificationChannelState | null }) {
  if (!app.device) return null;
  const words = WORDS[app.device];
  const { status } = app;
  const ready = status?.permission === "authorized" || status?.permission === "provisional";

  return (
    <ChannelCard
      id="notifications-app"
      title={`${words.device} app notifications`}
      tag={app.tag}
      control={
        status?.permission === "notDetermined" ? (
          <Button type="button" variant="outline" onClick={app.turnOn} disabled={app.busy}>
            Turn on
          </Button>
        ) : null
      }
      sendMe={<FollowsEmailList email={email} />}
      footerStart={<SaveStatus text={app.message} />}
      footerActions={
        <>
          <Button type="button" variant="outline" onClick={app.openSettings}>
            Open {words.device} settings
          </Button>
          <Button type="button" variant="outline" onClick={app.sendTest} disabled={app.busy || !ready || !status?.registered}>
            Send test
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm leading-snug text-[var(--ink-text)]">
          {status ? macNotificationStatusText(status, app.device) : `Checking this ${words.device}…`} They follow your email
          settings.
        </p>
        {app.error ? <InlineError>{app.error}</InlineError> : null}
      </div>
    </ChannelCard>
  );
}
