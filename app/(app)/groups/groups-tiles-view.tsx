"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LayoutGrid, ListFilter } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { cycleLabel } from "@/components/kit/format";
import { KeyHints } from "@/components/kit/kbd";
import { CardGrid } from "@/components/kit/layout";
import { SectionHeader } from "@/components/kit/section";
import { CardGridSkeleton, LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { GroupTile } from "./group-tile";
import type { GroupRowView } from "./group-row-model";
import type { GroupsFilter } from "./groups-toolbar";

const TILE_GRID_MIN = "20rem";
const OTHER_GROUPS_ID = "groups-other-tiles";
const KEY_HINTS = [
  { keys: ["J", "K"], label: "Move" },
  { keys: ["Enter"], label: "Open" }
];

export type TileSections = {
  needsYou: GroupRowView[];
  assigned: GroupRowView[];
  other: GroupRowView[];
};

type TileHandlers = {
  onNotesSaved: (rowId: string, value: string) => void;
  onPitchApproved: (rowId: string) => void;
};

function TileGrid({ views, handlers }: { views: GroupRowView[]; handlers: TileHandlers }) {
  return (
    <CardGrid minItemWidth={TILE_GRID_MIN} className="mt-3 max-md:gap-3">
      {views.map((view) => (
        <GroupTile key={view.key} view={view} onNotesSaved={handlers.onNotesSaved} onPitchApproved={handlers.onPitchApproved} />
      ))}
    </CardGrid>
  );
}

export function GroupsTilesSkeleton() {
  return (
    <LoadingRegion label="Loading groups…" className="space-y-3">
      <span className="sr-only">Loading groups…</span>
      <div className="flex min-h-8 items-center">
        <Skeleton className="h-5 w-40" />
      </div>
      <CardGridSkeleton
        count={6}
        className="grid gap-3 md:gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]"
        itemClassName="h-[9rem] md:h-[8.5rem]"
      />
    </LoadingRegion>
  );
}

/** A cycle with no groups yet (both views). The page's only filled button, in this state only. */
export function NoGroupsState({ cycleNumber }: { cycleNumber: number }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <EmptyState
        size="page"
        icon={LayoutGrid}
        title={`No groups in ${cycleLabel(cycleNumber)} yet`}
        description="Assign members, topics and producers in Package Cycle."
        action={
          <Link href={"/package-progress" as never} className={buttonVariants()}>
            Open Package Cycle
          </Link>
        }
      />
    </div>
  );
}

/**
 * The Tiles view: "Needs you" first, then the viewer's own groups, then a folded "Other groups".
 * Sections that end up empty are left out; filter-empty and cycle-empty states say what to do.
 */
export function GroupsTilesView({
  sections,
  cycleNumber,
  isAssociate,
  filter,
  onShowAll,
  otherOpen,
  onToggleOther,
  handlers
}: {
  sections: TileSections;
  cycleNumber: number;
  isAssociate: boolean;
  filter: GroupsFilter;
  onShowAll: () => void;
  otherOpen: boolean;
  onToggleOther: () => void;
  handlers: TileHandlers;
}) {
  const { needsYou, assigned, other } = sections;
  if (filter !== "all" && needsYou.length + assigned.length + other.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card">
        <EmptyState
          size="inline"
          icon={ListFilter}
          title={filter === "needs-you" ? "Nothing needs you right now." : "No groups are behind."}
          action={
            <Button type="button" variant="outline" onClick={onShowAll}>
              Show all groups
            </Button>
          }
        />
      </div>
    );
  }

  const assignedTitle = isAssociate ? "Your groups" : "Assigned and in review";
  const showAssignedEmpty = filter === "all" && needsYou.length === 0 && assigned.length === 0 && other.length > 0;
  const firstSection = needsYou.length > 0 ? "needs-you" : assigned.length > 0 || showAssignedEmpty ? "assigned" : "other";
  const hints = (section: string): ReactNode => (section === firstSection ? <KeyHints items={KEY_HINTS} /> : undefined);
  // A filter's matches are never folded away; the remembered open state applies to All only.
  const filtered = filter !== "all";
  const otherShown = otherOpen || filtered;

  return (
    <div className="space-y-6">
      {needsYou.length > 0 ? (
        <section aria-labelledby="groups-needs-you">
          <SectionHeader id="groups-needs-you" title="Needs you" count={needsYou.length} actions={hints("needs-you")} />
          <TileGrid views={needsYou} handlers={handlers} />
        </section>
      ) : null}

      {assigned.length > 0 || showAssignedEmpty ? (
        <section aria-labelledby="groups-assigned">
          <SectionHeader id="groups-assigned" title={assignedTitle} count={assigned.length} actions={hints("assigned")} />
          {assigned.length > 0 ? (
            <TileGrid views={assigned} handlers={handlers} />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">None assigned to you in {cycleLabel(cycleNumber)}.</p>
          )}
        </section>
      ) : null}

      {other.length > 0 ? (
        <section aria-labelledby="groups-other">
          <SectionHeader
            id="groups-other"
            title="Other groups"
            count={other.length}
            actions={otherShown ? hints("other") : undefined}
            collapsible={filtered ? undefined : { open: otherOpen, onToggle: onToggleOther, controlsId: OTHER_GROUPS_ID }}
          />
          <div id={OTHER_GROUPS_ID}>{otherShown ? <TileGrid views={other} handlers={handlers} /> : null}</div>
        </section>
      ) : null}
    </div>
  );
}
