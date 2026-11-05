"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { fieldLabelClass } from "@/components/kit/field";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/src/lib/utils";

export type PastIdeasItem = { runDate: string; label: string; href: string; latest: boolean; active: boolean };
export type PastIdeasGroup = { month: string; items: PastIdeasItem[] };

/**
 * "Past ideas": every set by date, grouped by month, in a menu under the header. Opening it
 * focuses (and scrolls to) the set on screen; picking a date closes it; Esc closes it and returns
 * focus to the button. The server builds the labels and links, so this island stays tiny.
 */
export function PastIdeasMenu({ groups, className }: { groups: PastIdeasGroup[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }), "px-3", className)}>
        <CalendarDays aria-hidden />
        <span>Past ideas</span>
        <ChevronDown aria-hidden className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        aria-label="Past ideas"
        // One max-h class: twMerge would drop the kit's available-height cap for a plain 60vh.
        className="max-h-[min(60vh,var(--radix-popover-content-available-height))] w-[min(18rem,calc(100vw-2rem))]"
        onOpenAutoFocus={(event) => {
          const active = contentRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
          if (!active) return;
          event.preventDefault();
          active.focus();
        }}
      >
        {groups.map((group, groupIndex) => {
          const labelId = `${baseId}-${groupIndex}`;
          return (
            <div key={group.month} className={cn(groupIndex > 0 && "mt-1 border-t border-border pt-1")}>
              <p id={labelId} className={cn(fieldLabelClass, "px-2.5 pb-1 pt-2")}>
                {group.month}
              </p>
              <ul aria-labelledby={labelId}>
                {group.items.map((item) => (
                  <li key={item.runDate}>
                    <Link
                      href={item.href as never}
                      aria-current={item.active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex h-10 items-center justify-between gap-2 rounded-sm px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-green)] md:h-9",
                        item.active
                          ? // Soft White ring: a green ring would vanish on the green row (DESIGN.md §10).
                            "bg-[var(--brand-fill)] font-medium text-[var(--on-brand)] focus-visible:ring-[var(--on-brand)]"
                          : "text-[var(--ink-text)] hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:bg-[var(--ink-3)]"
                      )}
                    >
                      <span>{item.label}</span>
                      {item.latest ? (
                        item.active ? (
                          // A tinted tag would vanish on the green row, so the active row gets plain caps.
                          <span className={cn(fieldLabelClass, "text-[var(--on-brand)]")}>Latest</span>
                        ) : (
                          <StatusTag tone="success" size="sm">
                            Latest
                          </StatusTag>
                        )
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
