"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useEffect, useMemo, useState } from "react";
import { Check, Clapperboard, Play, X } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { SearchField } from "@/components/kit/search-field";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { ViewTabs } from "@/components/kit/view-tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MeetingCutCatalog, MeetingCutGroup, MeetingCutKind, MeetingCutVersion } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { formatWatchTime } from "@/src/lib/meetings/client/watch-sync";
import { cn } from "@/src/lib/utils";
import { IconButton } from "../call/call-button";
import { Segmented } from "../call/segmented";
import { filterCutGroups, type CutFilter } from "@/src/lib/meetings/client/cut-filter";

type Selected = { group: MeetingCutGroup; kind: MeetingCutKind; version: MeetingCutVersion };

const KIND_LABEL: Record<MeetingCutKind, string> = { initial: "Initial", final: "Final" };
const FILTERS: ReadonlyArray<{ value: CutFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "initial", label: "Initial" },
  { value: "final", label: "Final" }
];
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";
/** Side padding shared by every band of the dialog, so their edges line up. */
const BAND = "px-4 sm:px-6";

function VersionChip({
  version,
  selected,
  onSelect,
  onStart
}: {
  version: MeetingCutVersion;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onStart}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md border px-2.5 font-mono text-xs tabular-nums transition-colors sm:h-8",
        selected
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border text-foreground hover:bg-[var(--ink-3)]",
        FOCUS
      )}
    >
      <span className="font-semibold">v{version.versionNumber}</span>
      {version.durationSeconds ? <span>· {formatWatchTime(version.durationSeconds)}</span> : null}
      {version.approved ? <Check className="h-3.5 w-3.5" aria-label="approved" /> : null}
    </button>
  );
}

/** One group: topic, members, then a row per kind with a fixed label column so chips line up. */
function GroupCard({
  group,
  filter,
  selected,
  onSelect,
  onStart
}: {
  group: MeetingCutGroup;
  filter: CutFilter;
  selected: Selected | null;
  onSelect: (selection: Selected) => void;
  onStart: (selection: Selected) => void;
}) {
  const kinds: MeetingCutKind[] = filter === "all" ? ["initial", "final"] : [filter];
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{group.topic}</p>
        {group.members.length ? <p className="truncate text-xs text-muted-foreground">{group.members.join(", ")}</p> : null}
      </div>
      <div className="grid gap-2">
        {kinds.map((kind) => {
          const versions = group[kind];
          return (
            <div key={kind} className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-2">
              <span className="flex h-10 items-center text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground sm:h-8">
                {KIND_LABEL[kind]}
              </span>
              {versions.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {versions.map((version) => {
                    const selection = { group, kind, version };
                    return (
                      <VersionChip
                        key={version.versionId}
                        version={version}
                        selected={selected?.version.versionId === version.versionId}
                        onSelect={() => onSelect(selection)}
                        onStart={() => onStart(selection)}
                      />
                    );
                  })}
                </div>
              ) : (
                <span className="flex h-10 items-center text-xs text-muted-foreground sm:h-8">Not uploaded yet</span>
              )}
            </div>
          );
        })}
      </div>
    </li>
  );
}

function CardsSkeleton() {
  return (
    <LoadingRegion label="Loading the package cuts">
      <div aria-hidden className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-md border border-border p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-1.5 pt-1">
              <Skeleton className="h-8 w-14 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/**
 * Pick a group's Initial or Final Cut version to watch together: cycle tabs (newest first), then
 * search by topic or member and an Initial / Final filter on one row, cards in two columns, and a
 * sticky footer with the choice and Watch (or double-click a version). Full screen on phones.
 */
export function CutPickerDialog({
  open,
  onOpenChange,
  replacing,
  onWatch
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Something is already playing: starting replaces it for everyone. */
  replacing: boolean;
  onWatch: (mediaId: string, versionId: string) => void;
}) {
  const [cycle, setCycle] = useState<number | undefined>(undefined);
  const [catalog, setCatalog] = useState<MeetingCutCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CutFilter>("all");
  const [selected, setSelected] = useState<Selected | null>(null);

  // Clear the last error whenever a new load starts (below).
  const [prevLoad, setPrevLoad] = useState({ open: false, cycle, attempt });
  if (prevLoad.open !== open || prevLoad.cycle !== cycle || prevLoad.attempt !== attempt) {
    setPrevLoad({ open, cycle, attempt });
    if (open) setError(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    meetingsApi
      .cuts(cycle)
      .then((next) => {
        if (!cancelled) setCatalog(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, "Couldn't load the package cuts."));
      });
    return () => {
      cancelled = true;
    };
  }, [open, cycle, attempt]);

  const loading = open && !error && (!catalog || (cycle !== undefined && catalog.cycle !== cycle));
  const groups = useMemo(() => filterCutGroups(catalog?.groups ?? [], query, filter), [catalog, query, filter]);
  const narrowed = query.trim() !== "" || filter !== "all";

  const start = (selection: Selected) => {
    onWatch(selection.version.mediaId, selection.version.versionId);
    onOpenChange(false);
    setSelected(null);
  };

  const body = error ? (
    <ErrorState title={error} onRetry={() => setAttempt((n) => n + 1)} />
  ) : loading ? (
    <CardsSkeleton />
  ) : groups.length === 0 ? (
    <EmptyState
      icon={Clapperboard}
      title={catalog?.cycle === null ? "No cuts have been uploaded yet." : "No groups match."}
      action={
        narrowed && catalog?.cycle !== null ? (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        ) : undefined
      }
    />
  ) : (
    <ul className="grid gap-3 md:grid-cols-2">
      {groups.map((group) => (
        <GroupCard key={group.rowId} group={group} filter={filter} selected={selected} onSelect={setSelected} onStart={start} />
      ))}
    </ul>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        onOpenAutoFocus={pointerSafeAutoFocus}
        className="flex h-[min(720px,85dvh)] max-w-3xl flex-col gap-0 p-0 outline-none sm:p-0 [&>*]:min-w-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:max-w-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)]"
      >
        {/* Own close button in the header row, so on a full-screen phone it sits below the safe area, beside the title. */}
        <div className={cn("flex shrink-0 items-start gap-3 pt-4 sm:pt-6", BAND)}>
          <DialogHeader className="min-w-0 flex-1 text-left">
            <DialogTitle>Watch together</DialogTitle>
            <DialogDescription>Pick a cut. Everyone in the call watches it in sync, and anyone can pause or scrub.</DialogDescription>
          </DialogHeader>
          <IconButton label="Close" className="-mr-2 -mt-1.5 max-sm:h-10 max-sm:w-10" onClick={() => onOpenChange(false)}>
            <X />
          </IconButton>
        </div>

        {catalog && catalog.cycles.length > 0 ? (
          <ViewTabs
            ariaLabel="Cycle"
            className={cn("mt-3 shrink-0", BAND)}
            items={catalog.cycles.map((n) => ({ value: String(n), label: `Cycle ${n}` }))}
            value={String(cycle ?? catalog.cycle)}
            onChange={(value) => {
              setCycle(Number(value));
              setSelected(null);
            }}
          />
        ) : null}

        <div className={cn("flex shrink-0 flex-col gap-2 py-3 sm:flex-row sm:items-center", BAND)}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search topic or member"
            size="touch"
            className="min-w-0 sm:flex-1"
          />
          <div className="sm:w-60">
            <Segmented<CutFilter> label="Show" value={filter} onChange={setFilter} options={FILTERS} />
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4", BAND)}>{body}</div>

        <div
          className={cn(
            "flex shrink-0 flex-col gap-3 border-t border-border py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between",
            BAND
          )}
        >
          <div className="min-w-0 text-sm" aria-live="polite">
            <p className="truncate text-muted-foreground">
              {selected ? `${selected.group.topic} · ${KIND_LABEL[selected.kind]} Cut v${selected.version.versionNumber}` : "Choose a version."}
            </p>
            {/* Kept while a version is picked: that is the moment someone is about to press Watch. */}
            {replacing ? <p className="truncate text-xs text-[var(--brand-amber)]">This replaces the video everyone is watching.</p> : null}
          </div>
          <ActionBar size="touch" fullWidthOnPhone className="shrink-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!selected} onClick={() => selected && start(selected)}>
              <Play aria-hidden /> Watch
            </Button>
          </ActionBar>
        </div>
      </DialogContent>
    </Dialog>
  );
}
