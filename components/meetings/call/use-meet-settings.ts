"use client";

import { useCallback, useState } from "react";
import { loadMeetSettings, saveMeetSettings, type MeetSettings } from "@/src/lib/meetings/client/meet-settings";

/** Per-device Meetings settings (background, mirror, quality, chimes), saved as they change. */
export function useMeetSettings() {
  const [settings, setSettings] = useState<MeetSettings>(() => loadMeetSettings());
  const updateSettings = useCallback((patch: Partial<MeetSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    saveMeetSettings(patch);
  }, []);
  return { settings, updateSettings };
}
