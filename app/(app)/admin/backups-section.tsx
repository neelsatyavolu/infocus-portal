"use client";

import { useId, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { InlineError } from "@/components/kit/alert";
import { DisclosureToggle } from "@/components/kit/disclosure";
import { ErrorState } from "@/components/kit/empty-state";
import { IconButton } from "@/components/kit/icon-button";
import { Button } from "@/components/ui/button";
import { SettingsPanel, SettingsPanelBody, SettingsSection } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";
import { COLUMN_LABEL_CLASS, HealthLine, HealthTag, ROW_ACTION_CLASS, RowsSkeleton, When } from "./admin-ui";
import type { Health } from "./admin-status";
import { errorText, formatStorage, getData, type BackupLatest, type BackupStatus, type ReportMessage } from "./admin-types";

const VISIBLE_DUMPS = 3;

/** Saved | size | file | download. Phones: two lines with an icon-only Download. */
const DUMP_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 sm:grid-cols-[11rem_6rem_minmax(0,1fr)_auto]";

function LastRun({ latest }: { latest: BackupLatest | null }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-4 md:px-5">
      <p className={cn(COLUMN_LABEL_CLASS, "sm:pt-0.5")}>Last run</p>
      {latest == null ? (
        <p className="text-[13px] text-muted-foreground">No backups yet.</p>
      ) : latest.ok ? (
        // Plain text: the OK tag beside the section title already says it worked.
        <p className="text-[13px] text-foreground">
          <When iso={latest.at} />
          {latest.bytes != null ? <span className="font-mono tabular-nums"> · {formatStorage(latest.bytes)}</span> : null}
        </p>
      ) : (
        <HealthLine tone="danger">
          Failed <When iso={latest.at} />
          {latest.error ? ` · ${latest.error}` : ""}
        </HealthLine>
      )}
    </div>
  );
}

/** Admin → Backups: hourly Portal database dumps in R2 (super admin and adviser). */
export function BackupsSection({
  backups,
  error,
  health,
  onRetry,
  onMessage
}: {
  backups: BackupStatus | null;
  /** The last GET /api/platform/backups failed (and nothing loaded since). */
  error: string | null;
  health: Health;
  onRetry: () => void;
  onMessage: ReportMessage;
}) {
  const [queuing, setQueuing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();

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
    } catch (caught) {
      const errorMessage = errorText(caught, "Failed to queue backup.");
      onMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setQueuing(false);
    }
  }

  async function download(key: string) {
    try {
      const payload = await getData<{ url: string }>(`/api/platform/backups/download?key=${encodeURIComponent(key)}`);
      window.location.assign(payload.url);
    } catch (caught) {
      const errorMessage = errorText(caught, "Failed to download backup.");
      onMessage(errorMessage);
      toast.error(errorMessage);
    }
  }

  const failed = Boolean(error) && !backups;
  const dumps = backups?.configured ? backups.dumps : [];
  const shown = showAll ? dumps : dumps.slice(0, VISIBLE_DUMPS);

  return (
    <SettingsSection
      id="backups"
      title="Backups"
      status={<HealthTag health={health} />}
      description="Hourly copies of Portal database data (people, packages, grades, calendar). Not InFocus Drive videos. Kept for 7 days."
      actions={
        backups?.configured ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ROW_ACTION_CLASS}
            disabled={queuing}
            onClick={() => void queueBackup()}
          >
            {queuing ? "Queuing…" : "Backup now"}
          </Button>
        ) : null
      }
    >
      <SettingsPanel>
        {failed ? (
          <ErrorState title="Couldn't load backups" message={error ?? undefined} onRetry={onRetry} />
        ) : !backups ? (
          <RowsSkeleton />
        ) : !backups.configured ? (
          <SettingsPanelBody className="text-sm text-muted-foreground">
            Backups are not configured. Set the R2 Worker secrets. Dumps are Portal database only, not Drive files.
          </SettingsPanelBody>
        ) : (
          <>
            {/* A refresh failed after an earlier load: keep the list, say so once, offer a retry. */}
            {error ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 md:px-5">
                <InlineError>{`Couldn't refresh backups. ${error}`}</InlineError>
                <Button type="button" variant="ghost" size="sm" className={ROW_ACTION_CLASS} onClick={onRetry}>
                  Try again
                </Button>
              </div>
            ) : null}
            <LastRun latest={backups.latest} />

            {dumps.length === 0 ? (
              <SettingsPanelBody className="text-sm text-muted-foreground">
                No dump files yet. Use Backup now, then refresh in a minute.
              </SettingsPanelBody>
            ) : (
              <div>
                <div aria-hidden="true" className={cn(DUMP_GRID, "hidden px-4 py-2 sm:grid md:px-5")}>
                  <span className={COLUMN_LABEL_CLASS}>Saved</span>
                  <span className={cn(COLUMN_LABEL_CLASS, "text-right")}>Size</span>
                  <span className={COLUMN_LABEL_CLASS}>File</span>
                  <span />
                </div>
                <ul id={listId} aria-label="Backup files" className="divide-y divide-border border-border sm:border-t">
                  {shown.map((dump) => {
                    // Both Download buttons say which backup, so screen readers can tell the rows apart.
                    const downloadLabel = `Download backup from ${new Date(dump.lastModified).toLocaleString()}`;
                    return (
                      <li key={dump.key} className={cn(DUMP_GRID, "px-4 py-2 md:px-5")}>
                        <p className="col-start-1 row-start-1 text-[13px] text-foreground">
                          <When iso={dump.lastModified} />
                          <span className="font-mono tabular-nums text-muted-foreground sm:hidden"> · {formatStorage(dump.bytes)}</span>
                        </p>
                        <p className="hidden text-right font-mono text-[13px] tabular-nums text-muted-foreground sm:col-start-2 sm:row-start-1 sm:block">
                          {formatStorage(dump.bytes)}
                        </p>
                        <p
                          title={dump.key}
                          className="col-start-1 row-start-2 min-w-0 truncate font-mono text-xs text-muted-foreground sm:col-start-3 sm:row-start-1"
                        >
                          {dump.key}
                        </p>
                        <div className="col-start-2 row-span-2 row-start-1 flex justify-end sm:col-start-4 sm:row-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="hidden sm:inline-flex"
                            aria-label={downloadLabel}
                            onClick={() => void download(dump.key)}
                          >
                            <Download aria-hidden="true" />
                            Download
                          </Button>
                          <IconButton
                            label={downloadLabel}
                            icon={Download}
                            size="touch"
                            tooltip={false}
                            className="h-10 sm:hidden"
                            onClick={() => void download(dump.key)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {dumps.length > VISIBLE_DUMPS ? (
              <DisclosureToggle
                open={showAll}
                onToggle={() => setShowAll((open) => !open)}
                controls={listId}
                closedLabel={`Show ${dumps.length - VISIBLE_DUMPS} more`}
                openLabel="Show less"
              />
            ) : null}
          </>
        )}
      </SettingsPanel>
    </SettingsSection>
  );
}
