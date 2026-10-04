"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
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
export function GoogleCalendarCard() {
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
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Google Calendar</h2>
            <p className="text-sm text-muted-foreground">
              Meeting invites go out as Google Calendar events from this account. Sign in as the InFocus Google account.
            </p>
          </div>
        </div>
        <a href="/api/admin/google-calendar/connect" className={cn(buttonVariants(), "shrink-0")}>
          {status?.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </a>
      </div>

      <p
        className={cn(
          "mt-3 flex items-start gap-2 text-sm",
          status === null ? "text-muted-foreground" : healthy ? "text-foreground" : "text-danger"
        )}
      >
        {status === null ? null : healthy ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-green)]" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span>
          {status === null ? "Checking Google Calendar…" : statusLine(status)}
          {status?.lastSyncError ? ` · Last sync failed: ${status.lastSyncError}` : null}
        </span>
      </p>

      {result ? (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-sm",
            result.ok
              ? "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/10 text-foreground"
              : "border-danger/30 bg-danger-tint text-danger"
          )}
        >
          {result.message}
        </p>
      ) : null}
    </section>
  );
}
