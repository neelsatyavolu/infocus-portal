"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { CONTROL_HEIGHT, type ControlSize } from "@/components/kit/action-bar";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { rovingIndex } from "@/components/kit/roving";
import { formatCount } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";

export type SegmentedOption<T extends string | number> = {
  value: T;
  label?: ReactNode;
  icon?: KitIcon | ReactNode;
  /** Mono count after the label. */
  count?: number;
  disabled?: boolean;
  title?: string;
  /** Renders the segment as a link (aria-current) instead of a radio. */
  href?: string;
  /** Required for icon-only segments. */
  ariaLabel?: string;
};

/**
 * Joined one-of-N choice (Grid | List, Week | Pending, Who can join). The outer box is exactly
 * the row height, the active segment uses the InFocus Green fill, arrow keys move between
 * segments (radiogroup), and it scrolls inside itself if the options don't fit.
 */
export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  fullWidth = false,
  iconOnly = false,
  className
}: {
  value: T;
  onChange?: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  ariaLabel: string;
  /** Outer box height, so it lines up with h-8 / h-9 buttons and inputs in the same row. */
  size?: ControlSize;
  /** Segments share the full width equally. */
  fullWidth?: boolean;
  /** Hide labels (each option needs ariaLabel or a string label). */
  iconOnly?: boolean;
  className?: string;
}) {
  const refs = useRef<Array<HTMLElement | null>>([]);
  const asLinks = options.some((option) => option.href);
  const selectedIndex = options.findIndex((option) => option.value === value);

  function onKeyDown(event: KeyboardEvent<HTMLElement>, index: number) {
    if (asLinks) return;
    const next = rovingIndex(index, event.key, options.map((option) => Boolean(option.disabled)));
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange?.(options[next].value);
  }

  return (
    <div
      role={asLinks ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      className={cn(
        "max-w-full shrink-0 items-stretch gap-0.5 overflow-x-auto rounded-md border border-input p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        fullWidth ? "flex w-full" : "inline-flex",
        CONTROL_HEIGHT[size],
        className
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const label = typeof option.label === "string" ? option.label : undefined;
        const segmentClass = cn(
          // [&_svg]:size-4 also sizes element icons (`icon: <Moon />`), as the old Settings control did.
          "inline-flex h-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
          iconOnly ? "aspect-square px-0" : size === "sm" ? "px-2.5" : "px-3",
          fullWidth && "flex-1",
          checked
            ? "bg-[var(--brand-fill)] font-medium text-[var(--on-brand)]"
            : "text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
        );
        const content = (
          <>
            {option.icon ? renderIcon(option.icon, "h-4 w-4") : null}
            {iconOnly ? <span className="sr-only">{option.ariaLabel ?? label}</span> : option.label}
            {option.count !== undefined ? (
              <span className={cn("font-mono-broadcast text-[11px] tabular-nums", checked ? "opacity-80" : "text-muted-foreground")}>
                {formatCount(option.count)}
              </span>
            ) : null}
          </>
        );
        if (option.href) {
          return (
            <Link
              key={String(option.value)}
              href={option.href as never}
              aria-current={checked ? "page" : undefined}
              title={option.title ?? (iconOnly ? option.ariaLabel ?? label : undefined)}
              className={segmentClass}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconOnly ? option.ariaLabel ?? label : undefined}
            tabIndex={checked || (selectedIndex === -1 && index === 0) ? 0 : -1}
            disabled={option.disabled}
            title={option.title ?? (iconOnly ? option.ariaLabel ?? label : undefined)}
            onClick={() => onChange?.(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={segmentClass}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
