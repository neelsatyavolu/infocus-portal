"use client";

import { useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/src/lib/utils";

export type MeetingMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Quiet destructive (Danger text); the confirm step is a ConfirmDialog. */
  tone?: "danger";
};

const ITEM_SELECTOR = '[role="menuitem"]';

/**
 * The Meetings tab's small action menus (the ⋯ on a row, the Start now chevron). Same look and
 * keys as the kit ActionMenu (menu roles, ↑/↓/Home/End, Esc), but focus only moves to the first
 * item for keyboard opens (pointerSafeAutoFocus), so a click or tap shows no focus ring.
 */
export function MeetingMenu({
  items,
  label,
  trigger,
  align = "end"
}: {
  items: MeetingMenuItem[];
  /** The menu's accessible name. */
  label: string;
  /** A Button; it gets aria-haspopup and opens the menu. */
  trigger: ReactElement;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);

  const focusables = () => Array.from(content.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = focusables();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    const last = list.length - 1;
    let next = -1;
    if (event.key === "ArrowDown") next = index >= last ? 0 : index + 1;
    else if (event.key === "ArrowUp") next = index <= 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next < 0) return;
    event.preventDefault();
    list[next]?.focus();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild aria-haspopup="menu">
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        role="menu"
        aria-label={label}
        align={align}
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(event) => {
          // Pointer opens focus the menu itself; keyboard opens land on the first item.
          pointerSafeAutoFocus(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          focusables()[0]?.focus();
        }}
        className="min-w-[12rem]"
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
            className={cn(
              "flex min-h-9 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors",
              item.tone === "danger"
                ? "text-danger hover:bg-danger-tint focus-visible:bg-danger-tint"
                : "text-foreground hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)]"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
