"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { MeetingCutCatalog, MeetingCutGroup, MeetingCutKind, MeetingCutVersion } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { formatWatchTime } from "@/src/lib/meetings/client/watch-sync";
import { cn } from "@/src/lib/utils";
import { Segmented } from "../call/segmented";
import { filterCutGroups, type CutFilter } from "@/src/lib/meetings/client/cut-filter";

type Selected = { group: MeetingCutGroup; kind: MeetingCutKind; version: MeetingCutVersion };

const KIND_LABEL: Record<MeetingCutKind, string> = { initial: "Initial", final: "Final" };
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";

function VersionButton({
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
        "flex min-h-9 items-center gap-1.5 rounded-[6px] border px-2.5 py-1 font-mono text-xs tabular-nums",
        selected
          ? "border-[var(--brand-green)] bg-primary text-primary-foreground"
          : "border-[var(--ink-4)] bg-[var(--ink-2)] text-foreground hover:bg-[var(--ink-3)]",
        FOCUS
      )}
    >
      <span className="font-semibold">v{version.versionNumber}</span>
      {version.durationSeconds ? <span>{formatWatchTime(version.durationSeconds)}</span> : null}
      {version.approved ? <Check className="h-3.5 w-3.5" aria-label="approved" /> : null}
    </button>
  );
}

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
    <li className="space-y-2 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)]/40 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{group.topic}</p>
        {group.members.length ? <p className="truncate text-xs text-muted-foreground">{group.members.join(", ")}</p> : null}
      </div>
      {kinds.map((kind) => {
        const versions = group[kind];
        return (
          <div key={kind} className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 shrink-0 text-xs text-muted-foreground">{KIND_LABEL[kind]}</span>
            {versions.length ? (
              versions.map((version) => {
                const selection = { group, kind, version };
                return (
                  <VersionButton
                    key={version.versionId}
                    version={version}
                    selected={selected?.version.versionId === version.versionId}
                    onSelect={() => onSelect(selection)}
                    onStart={() => onStart(selection)}
                  />
                );
              })
            ) : (
              <span className="text-xs text-muted-foreground">Not uploaded yet</span>
            )}
          </div>
        );
      })}
    </li>
  );
}

/**
 * Pick a group's Initial or Final Cut version to watch together: cycle tabs (newest first),
 * search by topic or member, Initial / Final filter, then Watch (or double-click a version).
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
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

  const start = (selection: Selected) => {
    onWatch(selection.version.mediaId, selection.version.versionId);
    onOpenChange(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="flex max-h-[85dvh] max-w-xl flex-col gap-3 outline-none [&>*]:min-w-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>Watch together</DialogTitle>
          <DialogDescription>Pick a cut. Everyone in the call watches it in sync, and anyone can pause or scrub.</DialogDescription>
        </DialogHeader>

        {catalog && catalog.cycles.length > 0 ? (
          <div role="tablist" aria-label="Cycle" className="flex shrink-0 gap-1 overflow-x-auto">
            {catalog.cycles.map((n) => {
              const active = (cycle ?? catalog.cycle) === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setCycle(n);
                    setSelected(null);
                  }}
                  className={cn(
                    "min-h-9 shrink-0 rounded-[6px] px-3 text-sm",
                    active ? "bg-[var(--ink-3)] font-medium text-foreground" : "text-muted-foreground hover:bg-[var(--ink-2)]",
                    FOCUS
                  )}
                >
                  Cycle {n}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topic or member" aria-label="Search topic or member" className="pl-8" />
          </div>
          <div className="sm:w-56">
            <Segmented<CutFilter>
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "initial", label: "Initial" },
                { value: "final", label: "Final" }
              ]}
            />
          </div>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto overscroll-contain pr-1">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <span>{error}</span>
              <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
            </div>
          ) : groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {catalog?.cycle === null ? "No cuts have been uploaded yet." : "No groups match."}
            </p>
          ) : (
            <ul className="space-y-2">
              {groups.map((group) => (
                <GroupCard key={group.rowId} group={group} filter={filter} selected={selected} onSelect={setSelected} onStart={start} />
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 border-t border-[var(--ink-4)] pt-3 sm:justify-between">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {selected
              ? `${selected.group.topic} · ${KIND_LABEL[selected.kind]} Cut v${selected.version.versionNumber}`
              : replacing
                ? "This replaces the video everyone is watching."
                : "Choose a version."}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!selected} onClick={() => selected && start(selected)}>
              <Play className="h-4 w-4" aria-hidden /> Watch
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
