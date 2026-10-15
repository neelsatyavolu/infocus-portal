"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { ErrorState } from "@/components/kit/empty-state";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { SettingsPanel, SettingsSection } from "@/components/settings-layout";
import type { CalendarSyncStatus } from "@/src/lib/program-config";
import { cn } from "@/src/lib/utils";
import { HealthTag, ROW_ACTION_CLASS, RowsSkeleton } from "./admin-ui";
import type { Health } from "./admin-status";
import { formatWhen } from "./admin-types";
import { CalendarDaysPanel } from "./calendar-days-panel";
import { formatDay } from "./configuration-format";
import { SchoolYearsPanel } from "./school-years-panel";
import type { AdminConfiguration } from "./use-admin-configuration";

/** The muted detail under the description; a failed check's own message gets a Danger line below it. */
function syncSummary(status: CalendarSyncStatus | null) {
  if (!status) return "Not checked yet. The Portal checks once a day.";
  const when = formatWhen(status.at);
  if (!status.ok) return `Last checked ${when}.`;
  if (status.finalsDates.length === 0) return `Last checked ${when}. Paly's calendar lists no finals days yet.`;
  return `Last checked ${when}. Finals days: ${status.finalsDates.map(formatDay).join(", ")}.`;
}

/** Spans only: it sits inside the section description's paragraph. */
function SyncDetail({ status }: { status: CalendarSyncStatus | null }) {
  return (
    <span className="mt-1.5 block space-y-1 text-[13px] leading-snug">
      <span className="block">{syncSummary(status)}</span>
      {status && !status.ok && status.message ? (
        <span className="flex items-start gap-1.5 text-danger">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{status.message}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Admin → School year → School calendar (#configuration). The header says how the daily check of
 * Paly's calendar went (tag, when, finals days) with Sync now beside it, the same idiom as Backups;
 * below are what that check feeds: the school years and the days off. Everything here used to be
 * fixed in code; execs and the adviser can change it without a developer.
 */
export function ConfigurationSection({
  configuration,
  calendarHealth
}: {
  configuration: AdminConfiguration;
  calendarHealth: Health;
}) {
  const { config, setConfig, days, state, error, reload, loadDays, syncing, syncNow } = configuration;

  return (
    <SettingsSection
      id="configuration"
      title="School calendar"
      status={<HealthTag health={calendarHealth} srLabel="Paly's calendar check: " />}
      description={
        <>
          Finals weeks and new school years are read from Paly&apos;s bell schedule. School years save with Save school
          years; days off save as you add them.
          {config ? (
            <SyncDetail status={config.calendarSync} />
          ) : state === "error" ? null : (
            <Skeleton className="mt-1.5 h-3.5 w-56 max-w-full" />
          )}
        </>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ROW_ACTION_CLASS}
          disabled={syncing || !config}
          onClick={() => void syncNow()}
        >
          <RefreshCw aria-hidden="true" className={cn(syncing && "motion-safe:animate-spin")} />
          {syncing ? "Checking…" : "Sync now"}
        </Button>
      }
    >
      {state === "error" ? (
        <SettingsPanel>
          <ErrorState
            title="Couldn't load the school calendar"
            message={error ?? undefined}
            onRetry={() => void reload()}
          />
        </SettingsPanel>
      ) : (
        <div className="space-y-4">
          <SettingsPanel>
            {config ? (
              <SchoolYearsPanel
                years={config.schoolYears}
                onSaved={async (next) => {
                  setConfig(next);
                  await loadDays();
                }}
              />
            ) : (
              <RowsSkeleton />
            )}
          </SettingsPanel>

          <SettingsPanel>
            <CalendarDaysPanel
              days={days}
              loading={state === "loading"}
              onChanged={loadDays}
              onResync={() => syncNow(true)}
            />
          </SettingsPanel>
        </div>
      )}
    </SettingsSection>
  );
}
