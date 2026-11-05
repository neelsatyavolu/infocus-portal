"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { Check, Loader2, MoreHorizontal } from "lucide-react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/src/lib/utils";

export type MenuItem = {
  key?: string;
  label: ReactNode;
  icon?: KitIcon | ReactNode;
  /** Muted second line (or why it's disabled). */
  hint?: ReactNode;
  onSelect?: () => void;
  href?: string;
  external?: boolean;
  /** danger: quiet destructive (Danger text). The confirm step still uses ConfirmDialog. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** A check mark: the current choice in a "Status" or "Version" menu. */
  checked?: boolean;
  hidden?: boolean;
};

export type MenuEntry = MenuItem | "separator" | { type: "label"; label: ReactNode };

const ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"])';

function isItem(entry: MenuEntry): entry is MenuItem {
  return typeof entry === "object" && !("type" in entry);
}

/** Drops hidden items, then separators left at the ends or doubled up. */
export function visibleMenuEntries(entries: MenuEntry[]): MenuEntry[] {
  const result: MenuEntry[] = [];
  for (const entry of entries) {
    if (isItem(entry) && entry.hidden) continue;
    if (entry === "separator" && (result.length === 0 || result[result.length - 1] === "separator")) continue;
    result.push(entry);
  }
  return result[result.length - 1] === "separator" ? result.slice(0, -1) : result;
}

/**
 * The overflow menu (⋯) for row and page actions, on the shared Popover: menu roles, ↑/↓/Home/End,
 * Esc to close, link items, check marks, disabled items with a reason, separators, group labels
 * and a quiet danger tone. Open it at a point (right-click) with `anchorPoint` + controlled `open`.
 */
export function ActionMenu({
  items,
  label,
  trigger,
  triggerIcon = MoreHorizontal,
  triggerText,
  variant = "ghost",
  size = "md",
  align = "end",
  side = "bottom",
  open: openProp,
  onOpenChange,
  anchorPoint,
  disabled = false,
  busy = false,
  className
}: {
  items: MenuEntry[];
  /** aria-label for the trigger and the menu. */
  label: string;
  /** Your own trigger element (a Button). */
  trigger?: ReactElement;
  triggerIcon?: KitIcon;
  /** Show words next to the icon ("More"). */
  triggerText?: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "md";
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Viewport point to open at (context menus). Use with a controlled `open`. */
  anchorPoint?: { x: number; y: number } | null;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const content = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => visibleMenuEntries(items), [items]);

  function setOpen(next: boolean) {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  }

  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => new DOMRect(anchorPoint?.x ?? 0, anchorPoint?.y ?? 0, 0, 0)
      }
    }),
    [anchorPoint?.x, anchorPoint?.y]
  );

  function focusables() {
    return Array.from(content.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = focusables();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1) % list.length;
    else if (event.key === "ArrowUp") next = (index - 1 + list.length) % list.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    list[next]?.focus();
  }

  const itemClass = (item: MenuItem) =>
    cn(
      "flex min-h-9 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors",
      item.disabled
        ? "cursor-not-allowed opacity-50"
        : item.tone === "danger"
          ? "text-danger hover:bg-danger-tint focus-visible:bg-danger-tint"
          : "text-foreground hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)]"
    );

  const itemBody = (item: MenuItem) => (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:size-4">
        {item.checked ? <Check className="h-4 w-4 text-[var(--brand-green)]" aria-hidden /> : item.icon ? renderIcon(item.icon, "h-4 w-4") : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.hint ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
      </span>
    </>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {anchorPoint ? (
        <PopoverAnchor virtualRef={virtualRef} />
      ) : (
        <PopoverTrigger asChild disabled={disabled || busy} aria-haspopup="menu">
          {trigger ?? (
            <button
              type="button"
              aria-label={triggerText ? undefined : label}
              title={label}
              className={cn(
                buttonVariants({ variant, size: triggerText ? (size === "sm" ? "sm" : "default") : "icon" }),
                !triggerText && "aspect-square w-auto px-0",
                size === "sm" ? "h-8" : "h-9",
                className
              )}
            >
              {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : renderIcon(triggerIcon, "h-4 w-4")}
              {triggerText}
            </button>
          )}
        </PopoverTrigger>
      )}
      <PopoverContent
        ref={content}
        role="menu"
        aria-label={label}
        align={align}
        side={side}
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusables()[0]?.focus();
        }}
        className="min-w-[12rem]"
      >
        {entries.map((entry, index) => {
          if (entry === "separator") {
            return <div key={`separator-${index}`} role="separator" className="-mx-1 my-1 h-px bg-border" />;
          }
          if (!isItem(entry)) {
            return (
              <div key={`label-${index}`} role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
                {entry.label}
              </div>
            );
          }
          const key = entry.key ?? (typeof entry.label === "string" ? entry.label : `item-${index}`);
          const role = entry.checked !== undefined ? "menuitemcheckbox" : "menuitem";
          if (entry.href && !entry.disabled) {
            const linkProps = {
              role,
              tabIndex: -1,
              "aria-checked": entry.checked,
              className: itemClass(entry),
              onClick: () => setOpen(false)
            };
            return entry.external ? (
              <a key={key} href={entry.href} target="_blank" rel="noopener noreferrer" {...linkProps}>
                {itemBody(entry)}
              </a>
            ) : (
              <Link key={key} href={entry.href as never} {...linkProps}>
                {itemBody(entry)}
              </Link>
            );
          }
          return (
            <button
              key={key}
              type="button"
              role={role}
              tabIndex={-1}
              aria-checked={entry.checked}
              aria-disabled={entry.disabled || undefined}
              onClick={() => {
                if (entry.disabled) return;
                setOpen(false);
                entry.onSelect?.();
              }}
              className={itemClass(entry)}
            >
              {itemBody(entry)}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
