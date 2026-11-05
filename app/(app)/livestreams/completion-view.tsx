"use client";

import { useState } from "react";
import { RotateCw, Users } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { Alert } from "@/components/kit/alert";
import { DataTable, type DataColumn } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { useRememberedState } from "@/components/kit/remembered-state";
import { SearchField } from "@/components/kit/search-field";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { filterCompletion, fullCreditCount, personLabel, type CompletionFilter, type CompletionRow } from "./livestreams-model";

/** The table keeps its own scroll so the header stays in view down a long roster. */
const TABLE_MAX_HEIGHT = "max(24rem, calc(100dvh - 18rem))";

function isCompletionFilter(value: unknown): value is CompletionFilter {
  return value === "all" || value === "below";
}

function NameCell({ row }: { row: CompletionRow }) {
  const name = personLabel(row);
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground" title={name}>
          {name}
        </span>
        {row.isManager ? <StatusTag>Manager</StatusTag> : null}
      </p>
      {row.email ? <p className="truncate text-xs text-muted-foreground">{row.email}</p> : null}
    </div>
  );
}

/** Shaded segments: hours from livestreams someone is signed up for that haven't happened yet. */
const SCHEDULED_FILL =
  "bg-[var(--brand-green)]/25 bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(0_0_0/0.18)_3px_6px)]";

function scheduledLabel(row: CompletionRow) {
  const hours = row.scheduledHours ?? 0;
  return hours > 0 ? `+${hours} h signed up` : null;
}

/**
 * Earned credit as the solid fill, and on top of the track (lighter, striped) what the
 * livestreams they're signed up for would add once they happen.
 */
function CreditBar({ row, className }: { row: CompletionRow; className?: string }) {
  const earned = Math.min(100, row.creditPercent);
  const projected = Math.max(earned, Math.min(100, row.projectedPercent ?? earned));
  const scheduled = scheduledLabel(row);
  return (
    <span
      role="progressbar"
      aria-label={`Credit for ${personLabel(row)}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={earned}
      aria-valuetext={scheduled ? `${earned}%, ${projected}% with livestreams signed up` : `${earned}%`}
      className={cn("relative block h-1.5 min-w-0 overflow-hidden rounded-full bg-[var(--ink-4)]", className)}
    >
      {projected > earned ? (
        <span className={cn("absolute inset-y-0 left-0", SCHEDULED_FILL)} style={{ width: `${projected}%` }} />
      ) : null}
      <span className="absolute inset-y-0 left-0 bg-[var(--brand-fill)]" style={{ width: `${earned}%` }} />
    </span>
  );
}

function HoursCell({ row }: { row: CompletionRow }) {
  if (row.isManager) return <span className="text-muted-foreground">—</span>;
  const scheduled = scheduledLabel(row);
  return (
    <span className="flex flex-col items-end leading-tight">
      <span>{`${row.completedHours} / ${row.requiredHours}`}</span>
      {scheduled ? <span className="text-[11px] text-muted-foreground">{scheduled}</span> : null}
    </span>
  );
}

const COLUMNS: Array<DataColumn<CompletionRow>> = [
  { key: "name", header: "Name", render: (row) => <NameCell row={row} /> },
  {
    key: "livestreams",
    header: "Livestreams",
    align: "end",
    mono: true,
    width: "10rem",
    render: (row) => (row.isManager ? `${row.managedEvents} / ${row.requiredManagedEvents} managed` : row.completedEvents)
  },
  {
    key: "hours",
    header: "Hours",
    align: "end",
    mono: true,
    width: "8rem",
    render: (row) => <HoursCell row={row} />
  },
  {
    key: "credit",
    header: "Credit",
    width: "11rem",
    render: (row) => (
      <div className="flex items-center gap-3">
        <CreditBar row={row} className="w-24" />
        <span className="w-10 text-right font-mono-broadcast text-xs tabular-nums text-muted-foreground">{row.creditPercent}%</span>
      </div>
    )
  },
  { key: "points", header: "Points", align: "end", mono: true, width: "5rem", render: (row) => row.points }
];

/** Phones: name and points on one line, the credit bar, then one summary line. */
function PhoneRow({ row }: { row: CompletionRow }) {
  const summary = row.isManager
    ? `${row.managedEvents} / ${row.requiredManagedEvents} managed · ${row.creditPercent}%`
    : `${row.completedHours} / ${row.requiredHours} h${scheduledLabel(row) ? ` (${scheduledLabel(row)})` : ""} · ${row.creditPercent}% · ${row.completedEvents} ${row.completedEvents === 1 ? "livestream" : "livestreams"}`;
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <NameCell row={row} />
        <p className="shrink-0 font-mono-broadcast text-[13px] tabular-nums text-foreground">
          {row.points}
          <span className="text-muted-foreground"> pts</span>
        </p>
      </div>
      <CreditBar row={row} />
      <p className="text-xs tabular-nums text-muted-foreground">{summary}</p>
    </div>
  );
}

/** Credit roster (producers and livestream managers): find a person, or just who still needs hours. */
export function CompletionView({
  rows,
  loading,
  error,
  onRetry
}: {
  rows: CompletionRow[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useRememberedState<CompletionFilter>("livestreams:completion-filter:v1", "all", isCompletionFilter);
  const shown = rows ? filterCompletion(rows, query, filter) : [];
  const full = rows ? fullCreditCount(rows) : 0;
  const empty =
    rows && rows.length === 0 ? (
      <EmptyState icon={Users} title="No members to show" />
    ) : (
      <EmptyState
        size="inline"
        title={query.trim() ? `No one matches “${query.trim()}”` : "Everyone here has full credit."}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Show all
          </Button>
        }
      />
    );

  return (
    <section aria-label="Completion" className="space-y-3">
      <Toolbar
        aria-label="Completion filters"
        busy={loading && rows !== null}
        start={
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search members" className="w-full sm:w-64" />
            <SegmentedControl
              ariaLabel="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "below", label: "Below full credit" }
              ]}
            />
          </>
        }
        meta={
          // Just the count; the credit rule is the header's line for this view.
          rows ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                <span className="font-mono-broadcast tabular-nums text-foreground">{full}</span> of{" "}
                <span className="font-mono-broadcast tabular-nums text-foreground">{rows.length}</span> at full credit
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("inline-block h-1.5 w-4 rounded-full", SCHEDULED_FILL)} />
                Signed up, not yet held
              </span>
            </span>
          ) : null
        }
      />
      {error ? (
        <Alert
          tone="danger"
          action={
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRetry}>
              {loading ? <Spinner /> : <RotateCw aria-hidden />}
              Try again
            </Button>
          }
        >
          Couldn&apos;t load completion: {error}
        </Alert>
      ) : null}
      {rows === null && error && !loading ? null : (
        <DataTable
          caption="Livestream completion"
          columns={COLUMNS}
          rows={shown}
          rowKey={(row) => row.userId}
          renderMobileRow={(row) => <PhoneRow row={row} />}
          loading={rows === null}
          skeletonRows={8}
          empty={empty}
          maxHeight={TABLE_MAX_HEIGHT}
        />
      )}
    </section>
  );
}
