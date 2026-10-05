"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SettingsNotice, SettingsRow } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";

type Status = {
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

function since(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLine(status: Status) {
  if (!status.connected) return "Not connected. Meetings send no calendar invites.";
  const who = `Invites are sent from ${status.accountEmail}`;
  return status.connectedAt ? `${who} · since ${since(status.connectedAt)}` : who;
}

/** Admin: the InFocus Google account that sends meeting invites as Google Calendar events (super admin, adviser). */
export function GoogleCalendarRow() {
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // Google's round trip lands back here with ?gcal=connected or ?gcal=error&gcalMessage=…
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("gcal");
    if (outcome) {
      setResult(outcome === "connected"
        ? { ok: true, message: "Google Calendar is connected. Meeting invites will sync shortly." }
        : { ok: false, message: params.get("gcalMessage") || "Couldn't connect Google Calendar. Try again." });
      params.delete("gcal");
      params.delete("gcalMessage");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    void (async () => {
      try {
        const response = await fetch("/api/admin/google-calendar/status", { cache: "no-store" });
        const body = (await response.json()) as { data?: Status };
        if (response.ok && body.data) setStatus(body.data);
      } catch {
        // The card still offers Connect without a status.
      }
    })();
  }, []);

  const healthy = status?.connected === true && !status.lastSyncError;

  return (
    <div>
      <SettingsRow
        title="Google Calendar"
        description={
          <>
            Meeting invites go out as Google Calendar events from this account. Sign in as the InFocus Google account.
            <span
              className={cn(
                "mt-1.5 flex items-start gap-1.5",
                status === null ? "text-muted-foreground" : healthy ? "text-foreground" : "text-danger"
              )}
            >
              {status === null ? null : healthy ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-green)]" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {status === null ? "Checking Google Calendar…" : statusLine(status)}
                {status?.lastSyncError ? ` · Last sync failed: ${status.lastSyncError}` : null}
              </span>
            </span>
          </>
        }
      >
        <a href="/api/admin/google-calendar/connect" className={buttonVariants({ variant: "outline" })}>
          {status?.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </a>
      </SettingsRow>
      {result ? (
        <div className="px-4 pb-4 md:px-5">
          <SettingsNotice tone={result.ok ? "success" : "error"}>{result.message}</SettingsNotice>
        </div>
      ) : null}
    </div>
  );
}
