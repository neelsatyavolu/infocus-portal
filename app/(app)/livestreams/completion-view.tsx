"use client";

import { useState } from "react";
import { RotateCw, Users } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { Alert } from "@/components/kit/alert";
import { DataTable, type DataColumn } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { ProgressBar } from "@/components/kit/progress";
import { useRememberedState } from "@/components/kit/remembered-state";
import { SearchField } from "@/components/kit/search-field";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
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

function CreditBar({ row, className }: { row: CompletionRow; className?: string }) {
  return <ProgressBar value={Math.min(100, row.creditPercent)} label={`Credit for ${personLabel(row)}`} className={className} />;
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
    width: "7rem",
    render: (row) =>
      row.isManager ? <span className="text-muted-foreground">—</span> : `${row.completedHours} / ${row.requiredHours}`
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
    : `${row.completedHours} / ${row.requiredHours} h · ${row.creditPercent}% · ${row.completedEvents} ${row.completedEvents === 1 ? "livestream" : "livestreams"}`;
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
            <>
              <span className="font-mono-broadcast tabular-nums text-foreground">{full}</span> of{" "}
              <span className="font-mono-broadcast tabular-nums text-foreground">{rows.length}</span> at full credit
            </>
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
