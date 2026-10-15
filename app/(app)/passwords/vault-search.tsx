"use client";

import { useRef, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { CONTROL_HEIGHT, type ControlSize } from "@/components/kit/action-bar";
import { useHotkeys } from "@/components/kit/hotkeys";
import { Kbd } from "@/components/kit/kbd";
import { cn } from "@/src/lib/utils";

/**
 * The kit SearchField look (leading icon, clear button, "/" hint, 16px text on phones) with the
 * combobox attributes the list/detail layout needs: focus stays in the field while ↑/↓ move the
 * active login (aria-activedescendant). The kit field takes no ARIA pass-through, hence this
 * copy. "/" focuses it unless a dialog is open or you're typing.
 */
export function VaultSearch({
  value,
  onChange,
  size = "md",
  onKeyDown,
  combobox,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  size?: ControlSize;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Makes the field a combobox that controls the login listbox. */
  combobox?: { listId: string; activeId: string | null };
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useHotkeys({ "/": () => ref.current?.focus() });

  function clear() {
    onChange("");
    ref.current?.focus();
  }

  return (
    <div className={cn("relative flex min-w-0 items-center", CONTROL_HEIGHT[size], className)}>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder="Search passwords…"
        aria-label="Search passwords"
        aria-keyshortcuts="/"
        role={combobox ? "combobox" : undefined}
        aria-controls={combobox?.listId}
        aria-expanded={combobox ? Boolean(combobox.activeId) : undefined}
        aria-autocomplete={combobox ? "list" : undefined}
        aria-activedescendant={combobox?.activeId ?? undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            clear();
            return;
          }
          onKeyDown?.(event);
        }}
        className="h-full w-full min-w-0 rounded-md border border-input bg-transparent pl-8 pr-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-1 grid h-7 w-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <Kbd className="pointer-events-none absolute right-2 hidden lg:inline-flex">/</Kbd>
      )}
    </div>
  );
}
