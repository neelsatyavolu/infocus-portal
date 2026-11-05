"use client";

import { useId } from "react";
import { ChevronDown, Hourglass, RotateCw } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { RequestActions } from "./request-actions";
import { LIST_LABEL, RequestListHeader, RequestRow } from "./request-row";
import type { FilterValue, RequestView } from "./request-view";

/** The list card is the container the rows' column layout queries (see ROW_GRID in request-row.tsx). */
const CARD = "@container overflow-hidden rounded-md border border-border bg-card";

const FILTER_EMPTY: Record<FilterValue, string> = {
  "needs-you": "Nothing needs you right now.",
  pending: "No pending requests.",
  approved: "No approved requests.",
  denied: "No denied requests.",
  all: "No extension requests yet."
};

/** The list card while nothing is cached: the real column header and four row placeholders. */
export function RequestListSkeleton() {
  return (
    <LoadingRegion label="Loading extension requests" className={CARD}>
      <RequestListHeader />
      <div aria-hidden className="divide-y divide-border">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex min-h-14 items-center gap-4 px-4 py-2.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={index % 2 ? "h-3.5 w-1/3" : "h-3.5 w-1/2"} />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** A first load that failed: say so in place (no misleading empty list) and offer a retry. */
export function RequestListError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <Alert
      tone="danger"
      title="Couldn't load extension requests."
      action={
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? <Spinner /> : <RotateCw aria-hidden />}
          Try again
        </Button>
      }
    >
      {message}
    </Alert>
  );
}

type RowProps = {
  openId: string | null;
  isNew: (view: RequestView) => boolean;
  onToggle: (id: string) => void;
  registerButton: (id: string, element: HTMLButtonElement | null) => void;
  actions: RequestActions;
};

function Rows({ views, openId, isNew, onToggle, registerButton, actions }: RowProps & { views: RequestView[] }) {
  return views.map((view) => (
    <RequestRow
      key={view.entry.id}
      view={view}
      open={openId === view.entry.id}
      isNew={isNew(view)}
      onToggle={() => onToggle(view.entry.id)}
      registerButton={registerButton}
      actions={actions}
    />
  ));
}

/**
 * Denied requests in All: a closed "Denied N" row at the bottom that opens them in place. Its
 * chevron sits in the rows' chevron column and turns the same way (down, up when open).
 */
function DeniedFold({ views, open, onToggle, rowProps }: {
  views: RequestView[];
  open: boolean;
  onToggle: () => void;
  rowProps: RowProps;
}) {
  const listId = useId();
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={onToggle}
        className={cn(
          LIST_LABEL,
          "flex min-h-10 w-full items-center gap-2 px-4 text-left transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        )}
      >
        Denied
        <span className="font-mono-broadcast tabular-nums tracking-normal">{views.length}</span>
        <ChevronDown aria-hidden className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul id={listId} aria-label="Denied extension requests" className="divide-y divide-border border-t border-border">
          <Rows views={views} {...rowProps} />
        </ul>
      ) : null}
    </li>
  );
}

export function RequestList({
  total,
  matchingCount,
  shown,
  denied,
  deniedOpen,
  onToggleDenied,
  filter,
  emptyDescription,
  onShowAll,
  ...rowProps
}: RowProps & {
  /** Every request the viewer can see, before filtering. */
  total: number;
  /** Rows the filter matches, folded or not. */
  matchingCount: number;
  /** Rows above the Denied fold. */
  shown: RequestView[];
  /** Denied rows folded under All. */
  denied: RequestView[];
  deniedOpen: boolean;
  onToggleDenied: () => void;
  filter: FilterValue;
  emptyDescription: string;
  onShowAll: () => void;
}) {
  if (total === 0) {
    return (
      <div className={CARD}>
        <EmptyState icon={Hourglass} title="No extension requests yet" description={emptyDescription} />
      </div>
    );
  }
  if (matchingCount === 0) {
    return (
      <div className={CARD}>
        <EmptyState
          size="inline"
          title={FILTER_EMPTY[filter]}
          action={
            <Button type="button" variant="link" size="sm" onClick={onShowAll}>
              Show all
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={CARD}>
      {shown.length > 0 || deniedOpen ? <RequestListHeader /> : null}
      <ul aria-label="Extension requests" className="divide-y divide-border">
        <Rows views={shown} {...rowProps} />
        {denied.length > 0 ? (
          <DeniedFold views={denied} open={deniedOpen} onToggle={onToggleDenied} rowProps={rowProps} />
        ) : null}
      </ul>
    </div>
  );
}
