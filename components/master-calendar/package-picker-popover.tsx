"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import {
  approvalLabel,
  type Anchor,
  type PackageOption
} from "@/components/master-calendar/calendar-model";
import { dismissListeners, fixedPopoverStyle } from "@/components/master-calendar/popover-position";
import { cn } from "@/src/lib/utils";

const SIZE = { width: 320, height: 360 };

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

/** Package search opened by typing "[package]" in a notes field. Picking one inserts a pill. */
export function PackagePickerPopover({
  anchor,
  onSelect,
  onCancel
}: {
  anchor: Anchor;
  onSelect: (option: PackageOption) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 200);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listId = "master-calendar-package-results";

  useEffect(() => dismissListeners(() => containerRef.current, onCancel), [onCancel]);

  useEffect(() => {
    let active = true;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    fetch(`/api/master-calendar/packages?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: { results: PackageOption[] }; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to search packages.");
        if (!active) return;
        setResults(payload.data.results);
        setActiveIndex(0);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to search packages.");
        setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Insert a package"
      className="fixed z-50 w-80 rounded-md border border-border bg-popover p-2 text-popover-foreground"
      style={fixedPopoverStyle(anchor, SIZE)}
    >
      <div className="flex h-9 items-center gap-2 rounded-md border border-input px-2.5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          placeholder="Search packages…"
          aria-label="Search packages"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              const choice = results[activeIndex];
              if (choice) {
                event.preventDefault();
                onSelect(choice);
              }
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
        />
      </div>

      <div className="mt-2 max-h-72 overflow-y-auto">
        {loading ? (
          <p className="flex h-10 items-center gap-2 px-2 text-[13px] text-muted-foreground">
            <Spinner size="sm" />
            Searching…
          </p>
        ) : error ? (
          <InlineError className="px-2 py-2">{error}</InlineError>
        ) : results.length === 0 ? (
          <p className="flex h-10 items-center px-2 text-[13px] text-muted-foreground">
            {query.trim().length === 0 ? "Type to search packages." : "No matches."}
          </p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Packages" className="space-y-0.5">
            {results.map((option, index) => {
              const approval = approvalLabel(option.approvalStatus);
              return (
                <li
                  key={option.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Tab reaches each result too (Enter or Space picks it), as well as ↑/↓ in the field.
                  tabIndex={0}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => onSelect(option)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelect(option);
                  }}
                  className={cn(
                    "flex min-h-10 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    index === activeIndex ? "bg-[var(--ink-3)]" : "hover:bg-[var(--ink-3)]"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{option.title}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{option.projectName}</span>
                  </span>
                  {approval ? (
                    <StatusTag tone={approval.tone} size="sm">
                      {approval.label}
                    </StatusTag>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
