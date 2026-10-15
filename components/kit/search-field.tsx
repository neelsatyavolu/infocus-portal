"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { CONTROL_HEIGHT, type ControlSize } from "@/components/kit/action-bar";
import { Kbd } from "@/components/kit/kbd";
import { isTypingTarget } from "@/components/kit/hotkeys";
import { cn } from "@/src/lib/utils";

/**
 * Search input with a leading icon and a clear button, the same height as buttons in its row.
 * 16px text on phones (no iOS zoom). `shortcut="/"` focuses it from anywhere on the page.
 */
export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  ariaLabel,
  size = "md",
  shortcut,
  autoFocus,
  inputRef,
  onKeyDown,
  onClear,
  id,
  name,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Defaults to the placeholder. */
  ariaLabel?: string;
  size?: ControlSize;
  shortcut?: "/";
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** For arrow-key list navigation from the field. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Runs after the clear button empties the field. */
  onClear?: () => void;
  id?: string;
  name?: string;
  className?: string;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;

  useEffect(() => {
    if (!shortcut) return;
    function focusOnSlash(event: globalThis.KeyboardEvent) {
      if (event.key !== shortcut || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      ref.current?.focus();
    }
    window.addEventListener("keydown", focusOnSlash);
    return () => window.removeEventListener("keydown", focusOnSlash);
  }, [shortcut, ref]);

  function clear() {
    onChange("");
    onClear?.();
    ref.current?.focus();
  }

  return (
    <div className={cn("relative flex min-w-0 items-center", CONTROL_HEIGHT[size], className)}>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <input
        ref={ref}
        id={id}
        name={name}
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        aria-keyshortcuts={shortcut}
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
      ) : shortcut ? (
        <Kbd className="pointer-events-none absolute right-2 hidden lg:inline-flex">{shortcut}</Kbd>
      ) : null}
    </div>
  );
}
