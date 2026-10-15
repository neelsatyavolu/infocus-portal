"use client";

import Link from "next/link";
import { ProgressSegments } from "@/components/kit/progress";
import { StatusTag } from "@/components/kit/status-tag";
import type { CycleCard } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";

/**
 * "This cycle" at the foot of the sidebar, for anyone on a package roster: the four stages as a
 * strip, the stage being worked on and one status tag; the whole card opens that stage. It sits
 * in the space a short sidebar leaves (students), hides on short screens and in the icon rail.
 */
export function SidebarCycleCard({ card, rail }: { card: CycleCard; rail: boolean }) {
  return (
    <div className={cn("shrink-0 px-3 pb-3 [@media(max-height:700px)]:hidden", rail && "lg:hidden")}>
      <Link
        href={card.href as never}
        className="block rounded-md border border-border bg-[var(--ink-2)] p-3 transition-colors hover:border-[var(--ink-4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            {card.cycleNumber ? `Cycle ${card.cycleNumber}` : "This cycle"}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{`${card.doneCount}/${card.segments.length}`}</span>
        </span>
        <ProgressSegments
          segments={card.segments}
          label={`${card.doneCount} of ${card.segments.length} stages done`}
          className="mt-2"
        />
        <span className="mt-2.5 flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{card.stageLabel}</span>
          <StatusTag tone={card.tag.tone} size="sm" className="shrink-0">
            {card.tag.label}
          </StatusTag>
        </span>
      </Link>
    </div>
  );
}
