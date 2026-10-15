"use client";

import { useEffect, useState } from "react";
import type { GoogleCalendarStatus, Remote, YoutubeStatus } from "./admin-types";

async function loadStatus<T>(url: string): Promise<Remote<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json()) as { data?: T };
    return response.ok && body.data ? { state: "ready", data: body.data } : { state: "error" };
  } catch {
    return { state: "error" };
  }
}

/**
 * The YouTube channel and Google Calendar authorizations (adviser and super admin; the APIs check
 * the real identity). One load feeds the Integrations cards, the Overview status strip and the
 * System tab warning. A failed check reads "Unknown", never "Checking…" forever.
 */
export function useAdminIntegrations(enabled: boolean) {
  const [youtube, setYoutube] = useState<Remote<YoutubeStatus>>({ state: "loading" });
  const [googleCalendar, setGoogleCalendar] = useState<Remote<GoogleCalendarStatus>>({ state: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadStatus<YoutubeStatus>("/api/admin/youtube/status").then((next) => {
      if (!cancelled) setYoutube(next);
    });
    void loadStatus<GoogleCalendarStatus>("/api/admin/google-calendar/status").then((next) => {
      if (!cancelled) setGoogleCalendar(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { youtube, googleCalendar };
}
