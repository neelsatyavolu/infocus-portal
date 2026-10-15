"use client";

import { Info } from "lucide-react";
import { ActionBarDivider, CONTROL_HEIGHT } from "@/components/kit/action-bar";
import { FilterChips, type FilterChipOption } from "@/components/kit/filter-chips";
import { IconButton } from "@/components/kit/icon-button";
import { KeyHints } from "@/components/kit/kbd";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { FilterValue } from "./request-view";

const STATUS_FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "all", label: "All" }
] as const;

/** The chip strip never wraps: it fills the row and scrolls sideways when the row is narrow. */
const CHIP_ROW =
  "flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Chip groups keep their natural width inside the scroller (the kit's FilterChips wraps from sm). */
const CHIP_GROUP = "max-w-none shrink-0 flex-nowrap overflow-visible sm:flex-nowrap";

function Chips({
  counts,
  filter,
  onFilterChange
}: {
  counts: Record<FilterValue, number>;
  filter: FilterValue;
  onFilterChange: (value: FilterValue) => void;
}) {
  // Pending · Approved · Denied always show, zeros included (they replace the old header counts).
  const statusOptions: Array<FilterChipOption<FilterValue>> = STATUS_FILTERS.map((option) => ({
    ...option,
    count: counts[option.value]
  }));
  const showNeedsYou = counts["needs-you"] > 0 || filter === "needs-you";
  return (
    <div className={CHIP_ROW}>
      {showNeedsYou ? (
        <>
          <FilterChips
            ariaLabel="Waiting on you"
            size="touch"
            value={filter}
            onChange={onFilterChange}
            className={CHIP_GROUP}
            options={[
              {
                value: "needs-you",
                label: "Needs you",
                count: counts["needs-you"],
                tone: "warning",
                title: "Pending requests waiting on your agreement or vote"
              }
            ]}
          />
          <ActionBarDivider />
        </>
      ) : null}
      <FilterChips
        ariaLabel="Status"
        size="touch"
        value={filter}
        onChange={onFilterChange}
        className={CHIP_GROUP}
        options={statusOptions}
      />
    </div>
  );
}

/**
 * The one row under the header (40px on phones, 36px from md). It never wraps: the status chips
 * (Needs you first, set apart by a hairline because it is a subset of Pending) fill the row and
 * scroll sideways when it is narrow, and the How it works toggle stays pinned at the end, icon
 * only below md. The J/K hint shows from xl, where the row has room for it. `counts` is null
 * while the list loads. (A plain flex row rather than the kit Toolbar, whose start and end
 * groups wrap onto separate lines.)
 */
export function RequestToolbar({
  counts,
  filter,
  onFilterChange,
  showKeyHint,
  busy,
  howOpen,
  howId,
  onToggleHow
}: {
  counts: Record<FilterValue, number> | null;
  filter: FilterValue;
  onFilterChange: (value: FilterValue) => void;
  showKeyHint: boolean;
  busy: boolean;
  howOpen: boolean;
  howId: string;
  onToggleHow: () => void;
}) {
  const howProps = {
    "aria-expanded": howOpen,
    "aria-controls": howOpen ? howId : undefined,
    onClick: onToggleHow
  };
  return (
    <div
      role="group"
      aria-label="Extension request filters"
      aria-busy={busy || undefined}
      className="relative flex min-w-0 items-center gap-2 md:gap-3"
    >
      {counts ? (
        <Chips counts={counts} filter={filter} onFilterChange={onFilterChange} />
      ) : (
        <div aria-hidden className={CHIP_ROW}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className={cn(CONTROL_HEIGHT.touch, "w-24 shrink-0 rounded-md")} />
          ))}
        </div>
      )}
      {showKeyHint ? (
        <KeyHints
          items={[{ keys: ["J", "K"], label: "Move between requests" }]}
          className="shrink-0 flex-nowrap whitespace-nowrap lg:hidden xl:flex"
        />
      ) : null}
      <IconButton {...howProps} label="How it works" icon={Info} size="touch" className="md:hidden" />
      <Button type="button" variant="ghost" className="hidden shrink-0 md:inline-flex" {...howProps}>
        <Info aria-hidden />
        How it works
      </Button>
      {busy ? (
        <span aria-hidden className="absolute inset-x-0 -bottom-1 h-0.5 overflow-hidden rounded-full bg-[var(--ink-3)]">
          <span className="block h-full w-1/3 bg-[var(--brand-fill)] motion-safe:animate-[loading-bar_1s_ease-in-out_infinite]" />
        </span>
      ) : null}
    </div>
  );
}
