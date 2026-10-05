"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsRow } from "@/components/settings-layout";
import {
  callMacApp,
  macNotificationStatusText,
  parseMacNotificationStatus,
  type MacNotificationStatus,
  type PortalAppDevice
} from "@/src/lib/mac-app-bridge";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const WORDS: Record<PortalAppDevice, { device: string; system: string; settings: string }> = {
  mac: { device: "Mac", system: "macOS", settings: "System Settings" },
  iphone: { device: "iPhone", system: "iOS", settings: "Settings" }
};

/** Settings row shown only inside the InFocus Mac or iPhone app (Apple Push, registered by the app). */
export function MacNotificationsRow({ device }: { device: PortalAppDevice }) {
  const words = WORDS[device];
  const [status, setStatus] = useState<MacNotificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: "notificationStatus" | "requestNotifications") {
    const next = parseMacNotificationStatus(await callMacApp(action));
    if (!next) throw new Error("The InFocus app sent an unexpected reply. Update the app and try again.");
    setStatus(next);
    return next;
  }

  useEffect(() => {
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
  }, [words.device]);

  async function turnOn() {
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
      setMessage("Test notification sent");
      window.setTimeout(() => setMessage(""), 1400);
    } catch (caught) {
      setError(errorMessage(caught, "Could not send a test notification."));
    } finally {
      setBusy(false);
    }
  }

  async function openSettings() {
    setError(null);
    try {
      await callMacApp("openNotificationSettings");
    } catch (caught) {
      setError(errorMessage(caught, `Could not open ${words.system} notification settings.`));
    }
  }

  const ready = status?.permission === "authorized" || status?.permission === "provisional";

  return (
    <SettingsRow
      title={`${words.device} app notifications`}
      description={
        <>
          {status ? macNotificationStatusText(status, device) : `Checking this ${words.device}…`} They follow your email
          settings.
          {message ? <span className="mt-1 block text-foreground">{message}</span> : null}
          {error ? (
            <span className="mt-1 flex items-center gap-1.5 text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </span>
          ) : null}
        </>
      }
    >
      {status?.permission === "notDetermined" ? (
        <Button type="button" size="sm" onClick={() => void turnOn()} disabled={busy}>
          Turn on
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => void openSettings()}>
        Open {words.device} settings
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void sendTest()}
        disabled={busy || !ready || !status?.registered}
      >
        Send test
      </Button>
    </SettingsRow>
  );
}
