"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SettingsNotice, SettingsRow } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";

type Status = {
  connected: boolean;
  source: "admin" | "env" | "none";
  channelTitle: string | null;
  connectedAt: string | null;
  lastCheckOk: boolean | null;
  message: string | null;
};

function since(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLine(status: Status) {
  if (status.connected) {
    const who = status.channelTitle ? `Connected as ${status.channelTitle}` : "Connected";
    return status.connectedAt ? `${who} · since ${since(status.connectedAt)}` : `${who} (set in Vercel)`;
  }
  if (status.source === "none") return "Not connected. Uploads to YouTube are paused.";
  return "Authorization expired. Uploads to YouTube are paused until you reconnect.";
}

/** Admin: the InFocus YouTube channel's authorization for show and package uploads (super admin only). */
export function YoutubeChannelRow() {
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // Google's round trip lands back here with ?youtube=connected or ?youtube=error&youtubeMessage=…
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("youtube");
    if (outcome) {
      setResult(outcome === "connected"
        ? { ok: true, message: "YouTube is connected. Uploads resume on the next check." }
        : { ok: false, message: params.get("youtubeMessage") || "Couldn't connect YouTube. Try again." });
      params.delete("youtube");
      params.delete("youtubeMessage");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    void (async () => {
      try {
        const response = await fetch("/api/admin/youtube/status", { cache: "no-store" });
        const body = (await response.json()) as { data?: Status };
        if (response.ok && body.data) setStatus(body.data);
      } catch {
        // The card still offers Reconnect without a status.
      }
    })();
  }, []);

  const healthy = status?.connected === true;

  return (
    <div>
      <SettingsRow
        title="YouTube channel"
        description={
          <>
            Show and package uploads use this authorization. Google will ask you to choose the InFocus channel.
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
                {status === null ? "Checking YouTube…" : statusLine(status)}
              </span>
            </span>
          </>
        }
      >
        <a href="/api/admin/youtube/connect" className={buttonVariants({ variant: "outline" })}>
          Reconnect YouTube
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
