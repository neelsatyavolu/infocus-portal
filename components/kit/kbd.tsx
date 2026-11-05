import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** A keyboard key chip in Geist Mono (⌘K, J, K, /, Esc). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-[var(--ink-2)] px-1 font-mono-broadcast text-[11px] font-medium leading-none text-[var(--ink-text)]",
        className
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * A muted row of shortcut hints ("J K Move · Enter Open"). Hidden below lg by default, since
 * phones and tablets have no keyboard.
 */
export function KeyHints({
  items,
  showOnTouch = false,
  className
}: {
  items: Array<{ keys: string[]; label: string }>;
  showOnTouch?: boolean;
  className?: string;
}) {
  return (
    <ul
      aria-label="Keyboard shortcuts"
      className={cn(
        "flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
        showOnTouch ? "flex" : "hidden lg:flex",
        className
      )}
    >
      {items.map((item) => (
        <li key={`${item.keys.join("+")}-${item.label}`} className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5">
            {item.keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** "mod+s" → ["⌘", "S"] on Apple devices, ["Ctrl", "S"] elsewhere. */
export function shortcutKeys(shortcut: string, isMac: boolean) {
  return shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (part === "mod") return isMac ? "⌘" : "Ctrl";
      if (part === "alt") return isMac ? "⌥" : "Alt";
      if (part === "shift") return isMac ? "⇧" : "Shift";
      if (part === "enter") return "↵";
      if (part === "esc" || part === "escape") return "Esc";
      return part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
    });
}
