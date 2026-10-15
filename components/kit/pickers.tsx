"use client";

import { ArrowUpDown } from "lucide-react";
import { cycleLabel } from "@/components/kit/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NameSortKey } from "@/src/lib/name-sort";
import { cn } from "@/src/lib/utils";

/**
 * The shared cycle switcher for every cycle screen (Groups, Package Cycle, Members, Grades, Grade
 * Editor, Brainstorming): an h-9 Select in the page header actions or the Toolbar — not a
 * floating bottom dock. Marks the current cycle. Hidden when there's only one choice.
 */
export function CyclePicker({
  cycles,
  value,
  onChange,
  currentCycle,
  leadingOptions,
  ariaLabel = "Cycle",
  size = "md",
  hideWhenSingle = true,
  className
}: {
  cycles: Array<{ cycleNumber: number; focus?: string | null }>;
  value: number;
  onChange: (cycleNumber: number) => void;
  currentCycle?: number | null;
  /** Extra choices before the cycles, e.g. { value: 0, label: "General" } on Members. */
  leadingOptions?: Array<{ value: number; label: string }>;
  ariaLabel?: string;
  size?: "sm" | "md";
  hideWhenSingle?: boolean;
  className?: string;
}) {
  const total = cycles.length + (leadingOptions?.length ?? 0);
  if (hideWhenSingle && total <= 1) return null;
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger aria-label={ariaLabel} className={cn("w-auto min-w-[9.5rem] max-w-[18rem] gap-2", size === "sm" ? "h-8" : "h-9", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {leadingOptions?.map((option) => (
          <SelectItem key={`lead-${option.value}`} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
        {cycles.map((cycle) => (
          <SelectItem key={cycle.cycleNumber} value={String(cycle.cycleNumber)}>
            {cycleLabel(cycle.cycleNumber, cycle.focus)}
            {currentCycle === cycle.cycleNumber ? " (now)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SORT_LABELS: Record<NameSortKey, string> = {
  lastName: "Last name",
  firstName: "First name",
  email: "Email"
};

/** Last name / First name / Email sort, with the sort icon inside the trigger (Members, Participation, Grade Editor, Package Cycle). */
export function NameSortSelect({
  value,
  onChange,
  ariaLabel = "Sort by",
  size = "md",
  className
}: {
  value: NameSortKey;
  onChange: (value: NameSortKey) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as NameSortKey)}>
      <SelectTrigger aria-label={ariaLabel} className={cn("w-auto min-w-[9.5rem] gap-2", size === "sm" ? "h-8" : "h-9", className)}>
        <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        {(Object.keys(SORT_LABELS) as NameSortKey[]).map((key) => (
          <SelectItem key={key} value={key}>
            {SORT_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
