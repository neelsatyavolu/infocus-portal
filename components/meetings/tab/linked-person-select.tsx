"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MeetingPerson } from "@/src/lib/meetings/types";

const NONE = "__none__";

/** Links a calendar-invite address to a producer (private meetings only invite linked people). */
export function LinkedPersonSelect({
  people,
  value,
  onChange,
  disabled,
  label
}: {
  people: MeetingPerson[] | null;
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled || !people}
    >
      <SelectTrigger aria-label={label} className="h-9 w-full focus:ring-0 focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] sm:w-48">
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
