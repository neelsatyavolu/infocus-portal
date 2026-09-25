"use client";

import { Moon, Sun } from "lucide-react";
import { applyTheme, type Theme } from "@/src/lib/theme";
import { useTheme } from "@/src/lib/use-theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun }
];

export function AppearanceCard() {
  const theme = useTheme();

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">Appearance</p>
      <div className="rounded-lg border border-border bg-muted p-3">
        <p className="mb-2 text-sm text-foreground">Theme</p>
        <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-border bg-secondary p-1 text-sm">
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${theme === value ? "bg-background text-foreground" : "text-muted-foreground"}`}
              onClick={() => applyTheme(value)}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Saved in this browser. Dark is the default.</p>
      </div>
    </section>
  );
}
