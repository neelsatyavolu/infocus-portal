"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import {
  callMacApp,
  macNotificationStatusText,
  parseMacNotificationStatus,
  type MacNotificationStatus
} from "@/src/lib/mac-app-bridge";

const buttonClass =
  "rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Settings block shown only inside the InFocus Mac app (Apple Push, registered by the app). */
export function MacNotificationsCard() {
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
        if (active) setError(errorMessage(caught, "Could not read Mac notification settings."));
      });
    return () => {
      active = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const next = await run("requestNotifications");
      if (next.permission === "denied") setError("macOS blocked notifications for InFocus. Turn them on in System Settings.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not turn on Mac notifications."));
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
      setError(errorMessage(caught, "Could not open macOS notification settings."));
    }
  }

  const ready = status?.permission === "authorized" || status?.permission === "provisional";

  return (
    <article className="rounded-xl border border-border bg-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm text-foreground">
          <BellRing className="h-4 w-4" /> Mac app notifications
        </p>
        <div className="flex items-center gap-2">
          {status?.permission === "notDetermined" ? (
            <button type="button" onClick={() => void turnOn()} disabled={busy} className={buttonClass}>
              Turn on
            </button>
          ) : null}
          <button type="button" onClick={() => void sendTest()} disabled={busy || !ready || !status?.registered} className={buttonClass}>
            Test Notification
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {status ? macNotificationStatusText(status) : "Checking this Mac…"} They follow your email settings above.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void openSettings()} className={buttonClass}>
          Open Mac Notification Settings
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-foreground">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-amber-300">{error}</p> : null}
    </article>
  );
}
