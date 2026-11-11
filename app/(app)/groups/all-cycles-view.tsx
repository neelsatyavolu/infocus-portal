"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { cycleLabel } from "@/components/kit/format";
import { KeyHints } from "@/components/kit/kbd";
import { SectionHeader } from "@/components/kit/section";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { tileTags } from "./group-tile";
import type { CycleTab } from "./group-row-model";
import type { OutstandingCycle, OutstandingPackage } from "./outstanding-packages";

const KEY_HINTS = [
  { keys: ["J", "K"], label: "Move" },
  { keys: ["Enter"], label: "Open" }
];

export function AllCyclesSkeleton() {
  return (
    <LoadingRegion label="Loading every cycle…" className="space-y-3">
      <span className="sr-only">Loading every cycle…</span>
      <Skeleton className="h-5 w-40" />
      <div className="divide-y divide-border rounded-md border border-border">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/**
 * One package. Wide screens use fixed columns (cycle code, topic and people, pending stage,
 * status tags), all centred on the row, so stages and tags line up from row to row. Narrower
 * screens stack the tags under the topic, with the stage beside the title.
 */
const ROW_GRID = "lg:grid lg:grid-cols-[2.25rem_minmax(0,1fr)_6rem_22rem] lg:items-center lg:gap-x-4";
const STAGE_TEXT = "text-[11px] font-medium uppercase leading-5 tracking-[0.11em] text-muted-foreground";

function PackageRow({ item }: { item: OutstandingPackage }) {
  const { view } = item;
  return (
    <li className={`relative flex min-w-0 flex-col gap-2 px-4 py-3 transition-colors hover:bg-[var(--ink-3)]/40 ${ROW_GRID}`}>
      <span
        title={cycleLabel(item.cycleNumber)}
        className="font-mono-broadcast text-xs tabular-nums text-muted-foreground max-lg:hidden"
      >
        C{String(item.cycleNumber).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-foreground" title={view.topic}>
            {view.href ? (
              <Link
                href={view.href as never}
                data-group-tile=""
                className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--brand-green)]"
              >
                {view.topic}
              </Link>
            ) : (
              view.topic
            )}
          </h3>
          <span className={`shrink-0 lg:hidden ${STAGE_TEXT}`}>{view.pendingLabel}</span>
        </div>
        <p className="mt-0.5 truncate text-[13px] leading-5 text-muted-foreground">
          {view.memberNames}
          <span aria-hidden className="mx-1.5 text-border">·</span>
          AP {view.apName}
          <span aria-hidden className="mx-1.5 text-border">·</span>
          EP {view.epName}
        </p>
      </div>
      <span title="Pending stage" className={`truncate max-lg:hidden ${STAGE_TEXT}`}>
        {view.pendingLabel}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {tileTags(view).map((tag) => (
          <StatusTag key={tag.key} tone={tag.tone}>
            {tag.label}
          </StatusTag>
        ))}
      </div>
    </li>
  );
}

/**
 * Every cycle's packages that still aren't both graded and queued, oldest cycle first.
 * Each cycle is its own section, so it is always clear which cycle a package is from.
 */
export function AllCyclesView({ groups, cycles }: { groups: OutstandingCycle[]; cycles: CycleTab[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card">
        <EmptyState
          size="page"
          icon={CircleCheck}
          title="Every package is graded, published and queued"
          description="Nothing is left over from any cycle."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group, index) => {
        const focus = cycles.find((cycle) => cycle.cycleNumber === group.cycleNumber)?.focus;
        const id = `groups-all-cycle-${group.cycleNumber}`;
        return (
          <section key={group.cycleNumber} aria-labelledby={id}>
            <SectionHeader
              id={id}
              title={cycleLabel(group.cycleNumber, focus)}
              count={group.packages.length}
              actions={index === 0 ? <KeyHints items={KEY_HINTS} /> : undefined}
            />
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
              {group.packages.map((item) => (
                <PackageRow key={item.view.key} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
