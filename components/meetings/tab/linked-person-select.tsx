"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MeetingPerson } from "@/src/lib/meetings/types";
import { cn } from "@/src/lib/utils";

const NONE = "__none__";

/** Links a calendar-invite address to a producer (private meetings only invite linked people). */
export function LinkedPersonSelect({
  id,
  people,
  value,
  onChange,
  disabled,
  label,
  className
}: {
  /** For a visible `<Label htmlFor>`, which then names the select (leave out `label`). */
  id?: string;
  people: MeetingPerson[] | null;
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  /** Accessible name when there's no visible label (the invite list rows). */
  label?: string;
  /** Height and width; the trigger is h-9 and full width by default. */
  className?: string;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled || !people}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className={cn("h-9 w-full focus:ring-0 focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]", className)}
      >
        <SelectValue placeholder={people ? "Not linked" : "Loading…"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not linked</SelectItem>
        {(people ?? []).map((person) => (
          <SelectItem key={person.id} value={person.id}>
            {person.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
