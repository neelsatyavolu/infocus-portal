"use client";

import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { SegmentedControl, SettingsRow } from "@/components/settings-layout";
import { applyTheme, type Theme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/use-theme";

const OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "light", label: "Light", icon: <Sun /> }
];

export function ThemeRow() {
  const theme = useTheme();

  return (
    <SettingsRow title="Theme" description="Saved in this browser. Dark is the default.">
      <SegmentedControl label="Theme" value={theme} options={OPTIONS} onChange={applyTheme} />
    </SettingsRow>
  );
}
