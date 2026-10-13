"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsPanel, SettingsRow, SettingsSection } from "@/components/settings-layout";
import type { CalendarDayRow } from "@/src/lib/calendar-day-groups";
import type { CalendarSyncStatus, ProgramConfig } from "@/src/lib/program-config";
import { CalendarDaysPanel } from "./calendar-days-panel";
import { formatDay } from "./configuration-format";
import { SchoolYearsPanel } from "./school-years-panel";

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? fallback);
  }
  return payload.data as T;
}

function syncSummary(status: CalendarSyncStatus | null) {
  if (!status) return "Not checked yet. The Portal checks once a day.";
  const when = new Date(status.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  if (!status.ok) return `Last checked ${when}. ${status.message}`;
  if (status.finalsDates.length === 0) return `Last checked ${when}. Paly's calendar lists no finals days yet.`;
  return `Last checked ${when}. Finals days: ${status.finalsDates.map(formatDay).join(", ")}.`;
}

/**
 * Admin → Configuration: the school year and calendar. Everything here used to be fixed in
 * code; execs and the adviser can now change it without a developer.
 */
export function ConfigurationSection() {
  const [config, setConfig] = useState<ProgramConfig | null>(null);
  const [days, setDays] = useState<CalendarDayRow[]>([]);
  const [syncing, setSyncing] = useState(false);

  const loadDays = useCallback(async () => {
    const data = await readJson<{ days: CalendarDayRow[] }>(
      await fetch("/api/platform/calendar", { cache: "no-store" }),
      "Could not load the calendar."
    );
    setDays(data.days);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [nextConfig] = await Promise.all([
          readJson<ProgramConfig>(await fetch("/api/platform/program-config", { cache: "no-store" }), "Could not load the configuration."),
          loadDays()
        ]);
        setConfig(nextConfig);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load the configuration.");
      }
    })();
  }, [loadDays]);

  const syncNow = useCallback(
    async (quiet = false) => {
      setSyncing(true);
      try {
        const status = await readJson<CalendarSyncStatus>(
          await fetch("/api/platform/calendar/sync", { method: "POST" }),
          "Could not check Paly's calendar."
        );
        const nextConfig = await readJson<ProgramConfig>(
          await fetch("/api/platform/program-config", { cache: "no-store" }),
          "Could not load the configuration."
        );
        setConfig(nextConfig);
        await loadDays();
        if (!quiet) {
          if (status.ok) toast.success("Calendar is up to date.");
          else toast.error(status.message);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not check Paly's calendar.");
      } finally {
        setSyncing(false);
      }
    },
    [loadDays]
  );

  return (
    <SettingsSection
      id="configuration"
      title="Configuration"
      description="The school year and calendar the whole Portal follows. Changes apply right away."
    >
      {config ? (
        <>
          <SchoolYearsPanel
            // Remount when a sync adds or changes a year, so the form shows the saved dates.
            key={JSON.stringify(config.schoolYears)}
            years={config.schoolYears}
            onSaved={async (next) => {
              setConfig(next);
              await loadDays();
            }}
          />
          <SettingsPanel>
            <SettingsRow
              title="Paly's calendar"
              description={`Finals weeks and new school years are read from Paly's bell schedule. ${syncSummary(config.calendarSync)}`}
            >
              <Button type="button" variant="outline" disabled={syncing} onClick={() => void syncNow()}>
                {syncing ? "Checking…" : "Sync now"}
              </Button>
            </SettingsRow>
          </SettingsPanel>
          <CalendarDaysPanel days={days} onChanged={loadDays} onResync={() => syncNow(true)} />
        </>
      ) : (
        <SettingsPanel>
          <p className="px-4 py-4 text-sm text-muted-foreground md:px-5">Loading configuration…</p>
        </SettingsPanel>
      )}
    </SettingsSection>
  );
}
