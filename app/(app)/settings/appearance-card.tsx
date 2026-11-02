"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { LayoutGrid, List, Monitor, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  SaveStatus,
  SegmentedControl,
  SettingsCell,
  SettingsGrid,
  SettingsPanel,
  SettingsSection
} from "@/components/settings-layout";
import { applyThemePreference, type ThemePreference } from "@/src/lib/theme";
import { useThemePreference } from "@/src/lib/use-theme";
import { HalloweenCells } from "./halloween-cells";
import { ThanksgivingCells } from "./thanksgiving-cells";
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

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <Monitor /> },
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> }
];

const VIEW_OPTIONS: { value: PreferenceState["defaultView"]; label: string; icon: ReactNode }[] = [
  { value: "grid", label: "Grid", icon: <LayoutGrid /> },
  { value: "list", label: "List", icon: <List /> }
];

function subscribeNever() {
  return () => undefined;
}

function usePreferences() {
  const [prefs, setPrefs] = useState<PreferenceState>(defaults);
  const [read, setRead] = useState(false);
  // False on the server and while hydrating, so the first render matches the server's.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

  if (hydrated && !read) {
    setRead(true);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PreferenceState;
        setPrefs({
          autoPlay: Boolean(parsed.autoPlay),
          soundEnabled: Boolean(parsed.soundEnabled),
          defaultView: parsed.defaultView === "list" ? "list" : "grid"
        });
      }
    } catch {
      // ignore invalid local preferences
    }
  }

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
 * 2×2 panel with one save status (plus the Halloween or Thanksgiving switches in season). Theme (System, Light or Dark) is a
 * cookie shared across the Portal hosts (applyThemePreference); the rest live in this browser's localStorage. `#playback`
 * still lands on the playback cells.
 */
export function AppearanceSection() {
  const themePreference = useThemePreference();
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
          <SettingsCell inline title="Theme" description="System follows your device." className="min-h-16">
            <SegmentedControl
              label="Theme"
              value={themePreference}
              options={THEME_OPTIONS}
              onChange={(next) => {
                applyThemePreference(next);
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
          <HalloweenCells onSaved={() => flashSaved("Saved")} />
          <ThanksgivingCells onSaved={() => flashSaved("Saved")} />
        </SettingsGrid>
      </SettingsPanel>
    </SettingsSection>
  );
}
