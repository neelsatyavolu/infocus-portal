"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsPanel, SettingsPanelBody, SettingsSection } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";
import { formatStorage, getData, type BackupStatus, type ReportMessage } from "./admin-types";

const VISIBLE_DUMPS = 3;

/** Admin → Backups: hourly Portal database dumps in R2 (super admin and adviser). */
export function BackupsSection({ backups, onMessage }: { backups: BackupStatus | null; onMessage: ReportMessage }) {
  const [queuing, setQueuing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function queueBackup() {
    setQueuing(true);
    onMessage(null);
    try {
      const response = await fetch("/api/platform/backups/run", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        const errorMessage = payload?.error?.message ?? "Failed to queue backup.";
        onMessage(errorMessage);
        toast.error(errorMessage);
        return;
      }
      toast.success("Backup queued");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to queue backup.";
      onMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setQueuing(false);
    }
  }

  async function download(key: string) {
    try {
      const payload = await getData<{ url: string }>(`/api/platform/backups/download?key=${encodeURIComponent(key)}`);
      window.location.href = payload.url;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to download backup.";
      onMessage(errorMessage);
      toast.error(errorMessage);
    }
  }

  const latest = backups?.configured ? backups.latest : null;
  const dumps = backups?.configured ? backups.dumps : [];

  return (
    <SettingsSection
      id="backups"
      title="Backups"
      description="Hourly copies of Portal database data (people, packages, grades, calendar). Not InFocus Drive videos. Kept for 7 days."
      actions={
        backups?.configured ? (
          <Button type="button" variant="outline" size="sm" disabled={queuing} onClick={() => void queueBackup()}>
            {queuing ? "Queuing…" : "Backup now"}
          </Button>
        ) : null
      }
    >
      <SettingsPanel>
        {!backups ? (
          <SettingsPanelBody className="text-sm text-muted-foreground">Loading backups…</SettingsPanelBody>
        ) : !backups.configured ? (
          <SettingsPanelBody className="text-sm text-muted-foreground">
            Backups are not configured. Set the R2 env vars on Vercel. Dumps are Portal database only, not Drive files.
          </SettingsPanelBody>
        ) : (
          <>
            <SettingsPanelBody
              className={cn(
                "flex items-start gap-2 text-sm",
                latest == null ? "text-muted-foreground" : latest.ok ? "text-foreground" : "text-danger"
              )}
            >
              {latest == null ? null : latest.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-green)]" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 break-words">
                {latest == null
                  ? "No backups yet."
                  : latest.ok
                    ? `Last run ok ${new Date(latest.at).toLocaleString()}${latest.bytes != null ? ` · ${formatStorage(latest.bytes)}` : ""}`
                    : `Last run failed ${new Date(latest.at).toLocaleString()}${latest.error ? ` · ${latest.error}` : ""}`}
              </span>
            </SettingsPanelBody>

            {dumps.length === 0 ? (
              <SettingsPanelBody className="text-sm text-muted-foreground">
                No dump files yet. Use Backup now, then refresh in a minute.
              </SettingsPanelBody>
            ) : (
              <ul className="divide-y divide-border">
                {(showAll ? dumps : dumps.slice(0, VISIBLE_DUMPS)).map((dump) => (
                  <li key={dump.key} className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-5">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{new Date(dump.lastModified).toLocaleString()}</p>
                      <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                        {formatStorage(dump.bytes)} · {dump.key}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void download(dump.key)}>
                      <Download />
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {dumps.length > VISIBLE_DUMPS ? (
              <button
                type="button"
                onClick={() => setShowAll((open) => !open)}
                aria-expanded={showAll}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground md:px-5"
              >
                {showAll ? "Show less" : `Show ${dumps.length - VISIBLE_DUMPS} more`}
                <ChevronDown className={cn("h-4 w-4 transition-transform", showAll && "rotate-180")} aria-hidden="true" />
              </button>
            ) : null}
          </>
        )}
      </SettingsPanel>
    </SettingsSection>
  );
}
