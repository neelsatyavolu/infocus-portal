"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { SearchField } from "@/components/kit/search-field";
import { ListSkeleton } from "@/components/kit/skeleton";
import type { MeetingPerson } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { cn } from "@/src/lib/utils";

/** Producer list for invite-only meetings (loaded once per page). */
export function useMeetingPeople(enabled: boolean) {
  const [people, setPeople] = useState<MeetingPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || people) return;
    let cancelled = false;
    meetingsApi
      .people()
      .then((data) => !cancelled && setPeople(data.people))
      .catch((err) => !cancelled && setError(errorMessage(err, "Couldn't load producers.")));
    return () => {
      cancelled = true;
    };
  }, [enabled, people]);
  return { people, error };
}

/** Searchable multi-select with chips. */
export function PeoplePicker({
  people,
  error,
  selected,
  onChange,
  excludeIds = [],
  noun = "producers"
}: {
  people: MeetingPerson[] | null;
  error: string | null;
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  excludeIds?: readonly string[];
  /** Plural, lowercase, for the search box and loading text. */
  noun?: string;
}) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? [])
      .filter((p) => !excludeIds.includes(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [people, query, excludeIds]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  if (error) {
    return (
      <Alert tone="danger" compact>
        {error}
      </Alert>
    );
  }
  if (!people) {
    return (
      <div role="status" aria-label={`Loading ${noun}`}>
        <ListSkeleton rows={3} leading={false} lines={1} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen people">
          {selected.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`Remove ${byId.get(id)?.name ?? "person"}`}
                className="inline-flex h-7 items-center gap-1 rounded-sm bg-[var(--brand-green)]/15 px-2 text-xs text-[var(--brand-green)] hover:bg-[var(--brand-green)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
              >
                {byId.get(id)?.name ?? "Unknown"}
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <SearchField value={query} onChange={setQuery} placeholder={`Search ${noun}`} />
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border" role="listbox" aria-multiselectable>
        {matches.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id} role="option" aria-selected={on}>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none",
                  on ? "text-foreground" : "text-[var(--ink-text)]"
                )}
              >
                {p.name}
                {on ? <Check className="h-4 w-4 text-[var(--brand-green)]" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
        {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">No one matches.</li> : null}
      </ul>
    </div>
  );
}
