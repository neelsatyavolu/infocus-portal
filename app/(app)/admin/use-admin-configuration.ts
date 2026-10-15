"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { CalendarDayRow } from "@/src/lib/calendar-day-groups";
import type { CalendarSyncStatus, ProgramConfig } from "@/src/lib/program-config";
import { errorText, type Remote } from "./admin-types";

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? fallback);
  }
  return payload.data as T;
}

const LOAD_ERROR = "Could not load the configuration.";

/**
 * Admin → School year: the program config (school years, Paly's calendar check) and the calendar
 * days. Loaded once Admin opens (GET program-config + calendar), so the Paly's calendar status
 * also feeds the tab warning, the header line and the Overview status strip.
 */
export function useAdminConfiguration(enabled: boolean) {
  const [config, setConfig] = useState<ProgramConfig | null>(null);
  const [days, setDays] = useState<CalendarDayRow[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadDays = useCallback(
    () =>
      fetch("/api/platform/calendar", { cache: "no-store" })
        .then((response) => readJson<{ days: CalendarDayRow[] }>(response, "Could not load the calendar."))
        .then((data) => setDays(data.days)),
    []
  );

  // Fetch only; state starts as "loading", so the first load needs no reset.
  const fetchConfig = useCallback(
    () =>
      fetch("/api/platform/program-config", { cache: "no-store" })
        .then((response) => Promise.all([readJson<ProgramConfig>(response, LOAD_ERROR), loadDays()]))
        .then(([nextConfig]) => {
          setConfig(nextConfig);
          setState("ready");
        })
        .catch((caught) => {
          const text = errorText(caught, LOAD_ERROR);
          setError(text);
          setState("error");
          toast.error(text);
        }),
    [loadDays]
  );

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    await fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (enabled) void fetchConfig();
  }, [enabled, fetchConfig]);

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
          LOAD_ERROR
        );
        setConfig(nextConfig);
        await loadDays();
        if (!quiet) {
          if (status.ok) toast.success("Calendar is up to date.");
          else toast.error(status.message);
        }
      } catch (caught) {
        toast.error(errorText(caught, "Could not check Paly's calendar."));
      } finally {
        setSyncing(false);
      }
    },
    [loadDays]
  );

  const calendarSync: Remote<CalendarSyncStatus | null> =
    state === "ready" && config ? { state: "ready", data: config.calendarSync } : { state: state === "error" ? "error" : "loading" };

  return { config, setConfig, days, state, error, reload: load, loadDays, syncing, syncNow, calendarSync };
}

export type AdminConfiguration = ReturnType<typeof useAdminConfiguration>;
