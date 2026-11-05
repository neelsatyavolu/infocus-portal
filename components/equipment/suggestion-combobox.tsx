"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/lib/utils";

export type SuggestionState = "loading" | "error" | "ready";

/**
 * A text field with an anchored suggestion listbox (ARIA combobox), used by the checkout item
 * code field.
 * - The list shows while `open`, the field is non-blank and not disabled.
 * - ↓/↑ move a highlight. The highlight only appears after an arrow key, so a barcode scanner's
 *   Enter still reaches `onEnter` (add the typed code) exactly as before.
 * - Enter with a highlight picks it; Cmd/Ctrl+Enter without one bubbles up (form submit shortcut).
 * - Escape, blur and picking close the list. Options keep focus on the field (mousedown).
 */
export function SuggestionCombobox<T>({
  id,
  inputRef,
  value,
  onValueChange,
  open,
  onOpenChange,
  options,
  optionKey,
  renderOption,
  onPick,
  onEnter,
  state = "ready",
  messages,
  listLabel,
  placeholder,
  disabled = false,
  required = false,
  describedBy,
  className,
  inputClassName
}: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: T[];
  optionKey: (option: T) => string;
  renderOption: (option: T) => ReactNode;
  onPick: (option: T) => void;
  /** Enter with no highlighted option (the default is to do nothing). */
  onEnter?: () => void;
  state?: SuggestionState;
  messages: { loading: string; error: string; empty: string };
  listLabel: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
  className?: string;
  inputClassName?: string;
}) {
  const listId = `${id}-${useId().replace(/:/g, "")}-list`;
  const [highlight, setHighlight] = useState(-1);
  const shown = open && value.trim().length > 0 && !disabled;
  const ready = state === "ready" && options.length > 0;
  const active = shown && ready && highlight >= 0 && highlight < options.length ? highlight : -1;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  function pick(option: T) {
    onPick(option);
    setHighlight(-1);
    onOpenChange(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!value.trim() || options.length === 0 || state !== "ready") return;
      event.preventDefault();
      if (!open) onOpenChange(true);
      const count = options.length;
      setHighlight((current) => {
        const from = current < count ? current : -1;
        if (event.key === "ArrowDown") return (from + 1) % count;
        return from <= 0 ? count - 1 : from - 1;
      });
      return;
    }
    if (event.key === "Escape") {
      if (shown) event.preventDefault();
      setHighlight(-1);
      onOpenChange(false);
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (active >= 0) {
      // A highlighted option wins over Enter-to-add and over the Cmd+Enter submit shortcut.
      event.preventDefault();
      event.stopPropagation();
      pick(options[active]);
      return;
    }
    if (event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    onEnter?.();
  }

  const message = state === "loading" ? messages.loading : state === "error" ? messages.error : messages.empty;

  return (
    <div className={cn("relative min-w-0", className)}>
      <Input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown && ready}
        aria-controls={shown && ready ? listId : undefined}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setHighlight(-1);
          onOpenChange(true);
        }}
        onFocus={() => onOpenChange(true)}
        onBlur={() => {
          setHighlight(-1);
          onOpenChange(false);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        required={required}
        className={inputClassName}
      />
      {shown ? (
        <div
          // Clicking anywhere in the popover (including its scrollbar) keeps focus in the field.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card py-1"
        >
          {ready ? (
            <ul id={listId} role="listbox" aria-label={listLabel}>
              {options.map((option, index) => (
                <li
                  key={optionKey(option)}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => pick(option)}
                  className="relative flex min-h-10 cursor-pointer flex-col justify-center gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[var(--ink-3)] aria-selected:bg-[var(--ink-3)] aria-selected:before:absolute aria-selected:before:inset-y-0 aria-selected:before:left-0 aria-selected:before:w-[3px] aria-selected:before:bg-[var(--brand-green)]"
                >
                  {renderOption(option)}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
              {message}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
