"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LayoutGrid, List, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  SaveStatus,
  SegmentedControl,
  SettingsCell,
  SettingsGrid,
  SettingsPanel,
  SettingsSection
} from "@/components/settings-layout";
import { applyTheme, type Theme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/use-theme";
import { useSavedFlash } from "./use-saved-flash";

type PreferenceState = {
  autoPlay: boolean;
  soundEnabled: boolean;
  defaultView: "grid" | "list";
};

/** Per-browser view and playback choices (same key and shape as before). */
const STORAGE_KEY = "infocus-settings";

const defaults: PreferenceState = {
  autoPlay: false,
  soundEnabled: true,
  defaultView: "grid"
};

const THEME_OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "light", label: "Light", icon: <Sun /> }
];

const VIEW_OPTIONS: { value: PreferenceState["defaultView"]; label: string; icon: ReactNode }[] = [
  { value: "grid", label: "Grid", icon: <LayoutGrid /> },
  { value: "list", label: "List", icon: <List /> }
];

function usePreferences() {
  const [prefs, setPrefs] = useState<PreferenceState>(defaults);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PreferenceState;
      setPrefs({
        autoPlay: Boolean(parsed.autoPlay),
        soundEnabled: Boolean(parsed.soundEnabled),
        defaultView: parsed.defaultView === "list" ? "list" : "grid"
      });
    } catch {
      // ignore invalid local preferences
    }
  }, []);

  function save(next: PreferenceState) {
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private windows can block storage; the choice still applies for this visit.
    }
  }

  return [prefs, save] as const;
}

/**
 * Settings → Appearance & playback: Theme and Default view, then the two playback switches, as one
 * 2×2 panel with one save status. Theme is a cookie shared across the Portal hosts (applyTheme);
 * the rest live in this browser's localStorage. `#playback` still lands on the playback cells.
 */
export function AppearanceSection() {
  const theme = useTheme();
  const [prefs, save] = usePreferences();
  const [savedLabel, flashSaved] = useSavedFlash();

  function update(next: PreferenceState) {
    save(next);
    flashSaved("Saved");
  }

  return (
    <SettingsSection
      id="appearance"
      title="Appearance & playback"
      description="Saved in this browser."
      actions={<SaveStatus text={savedLabel} />}
    >
      <SettingsPanel>
        <SettingsGrid>
          <SettingsCell inline title="Theme" description="Dark is the default." className="min-h-16">
            <SegmentedControl
              label="Theme"
              value={theme}
              options={THEME_OPTIONS}
              onChange={(next) => {
                applyTheme(next);
                flashSaved("Saved");
              }}
            />
          </SettingsCell>
          <SettingsCell inline title="Default view" className="min-h-16">
            <SegmentedControl
              label="Default view"
              value={prefs.defaultView}
              options={VIEW_OPTIONS}
              onChange={(defaultView) => update({ ...prefs, defaultView })}
            />
          </SettingsCell>
          <SettingsCell
            id="playback"
            inline
            title="Autoplay videos on open"
            htmlFor="pref-autoplay"
            className="min-h-16 scroll-mt-[calc(var(--app-header-h,0px)+3.5rem)] lg:scroll-mt-6"
          >
            <Switch id="pref-autoplay" checked={prefs.autoPlay} onCheckedChange={(next) => update({ ...prefs, autoPlay: next })} />
          </SettingsCell>
          <SettingsCell inline title="Start with sound on" htmlFor="pref-sound" className="min-h-16">
            <Switch
              id="pref-sound"
              checked={prefs.soundEnabled}
              onCheckedChange={(next) => update({ ...prefs, soundEnabled: next })}
            />
          </SettingsCell>
        </SettingsGrid>
      </SettingsPanel>
    </SettingsSection>
  );
}
