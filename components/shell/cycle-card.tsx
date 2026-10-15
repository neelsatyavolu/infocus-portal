"use client";

import Link from "next/link";
import { AlertTriangle, Check, Circle, CircleDot } from "lucide-react";
import { toneTextClass } from "@/components/kit/tone";
import type { CycleCard, CycleCardStage } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";

const STATE_ICON = {
  done: Check,
  current: CircleDot,
  later: Circle,
  revisions: AlertTriangle
} as const;

function StageRow({ stage }: { stage: CycleCardStage }) {
  const Icon = STATE_ICON[stage.state];
  const active = stage.state === "current" || stage.state === "revisions";
  const body = (
    <>
      <Icon
        aria-hidden
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          stage.state === "done" || stage.state === "current"
            ? "text-[var(--brand-green)]"
            : stage.state === "revisions"
              ? toneTextClass("danger")
              : "text-muted-foreground"
        )}
      />
      <span className={cn("min-w-0 flex-1 truncate", active ? "font-medium text-foreground" : "text-[var(--ink-text)]")}>
        {stage.label}
      </span>
      {stage.detail ? (
        <span
          className={cn(
            "shrink-0 text-xs",
            stage.tone === "neutral" ? "text-muted-foreground" : toneTextClass(stage.tone)
          )}
        >
          {stage.detail}
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "flex h-8 min-w-0 items-center gap-2 rounded-sm px-2 text-[13px]",
    active && "bg-[var(--ink-3)]",
    // On shorter screens only the stage being worked on stays, so the card never crowds the menu.
    !active && "[@media(max-height:860px)]:hidden"
  );
  return stage.href ? (
    <li>
      <Link
        href={stage.href as never}
        className={cn(
          className,
          "transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        {body}
      </Link>
    </li>
  ) : (
    <li className={cn(className, "opacity-70")} title="Opens when the stage before it is approved">
      {body}
    </li>
  );
}

/**
 * "This cycle" at the foot of the sidebar, for anyone on a package roster: each stage with its
 * result or due date (extension days counted), the one being worked on highlighted, every
 * unlocked stage a link. Short screens keep only the current stage; very short ones and the icon
 * rail hide it.
 */
export function SidebarCycleCard({ card, rail }: { card: CycleCard; rail: boolean }) {
  return (
    <section
      aria-label={card.cycleNumber ? `Cycle ${card.cycleNumber}` : "This cycle"}
      className={cn("shrink-0 px-3 pb-3 [@media(max-height:700px)]:hidden", rail && "lg:hidden")}
    >
      <div className="rounded-md border border-border bg-[var(--ink-2)] p-2">
        <div className="flex items-baseline justify-between gap-2 px-2 pb-1.5 pt-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            {card.cycleNumber ? `Cycle ${card.cycleNumber}` : "This cycle"}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            <span className="sr-only">Stages done: </span>
            {`${card.doneCount}/${card.segments.length}`}
          </span>
        </div>
        <ol className="space-y-0.5">
          {card.stages.map((stage) => (
            <StageRow key={stage.slug} stage={stage} />
          ))}
        </ol>
      </div>
    </section>
  );
}
