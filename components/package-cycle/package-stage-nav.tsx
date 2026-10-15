"use client";

import Link from "next/link";
import { BookOpen, Hourglass } from "lucide-react";
import { StageStatusChip } from "@/components/package-cycle/stage-status-chip";
import { executiveWaitPill } from "@/src/lib/package-approval";
import type { StageCommentUnread } from "@/src/lib/package-stage-comments";
import type { CycleStageStatus } from "@/src/lib/package-stage-status";
import { cn } from "@/src/lib/utils";

type StageSlug = "brainstorming" | "a-roll" | "initial-cut" | "final-cut";

const STAGES: Array<{ slug: StageSlug; label: string }> = [
  { slug: "brainstorming", label: "Brainstorming" },
  { slug: "a-roll", label: "A-roll/B-roll" },
  { slug: "initial-cut", label: "Initial Cut" },
  { slug: "final-cut", label: "Final Cut" }
];

/**
 * The stage bar on every student package page: one tab per stage with its status and unread
 * feedback (later stages stay disabled until they unlock), plus the cycle guide and, for
 * students, Extension Requests. It replaces the old per-stage sidebar links.
 */
export function PackageStageNav({
  pathname,
  unlocked,
  statuses,
  unread,
  remainingExecutiveSignoffs,
  extensionRequestsAwaiting,
  showExtensionRequests
}: {
  pathname: string;
  unlocked: { "a-roll": boolean; "initial-cut": boolean; "final-cut": boolean } | null;
  statuses: Record<StageSlug, CycleStageStatus> | null;
  unread: StageCommentUnread | null;
  remainingExecutiveSignoffs: number | null;
  extensionRequestsAwaiting: number;
  showExtensionRequests: boolean;
}) {
  const secondaryLink = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm transition",
      active ? "bg-[var(--brand-fill)] text-[var(--on-brand)]" : "text-muted-foreground hover:bg-card hover:text-foreground"
    );

  return (
    <nav aria-label="Package stages" className="mb-5 flex flex-wrap items-stretch gap-2">
      <ol className="grid min-w-0 flex-[999_1_520px] grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((stage, index) => {
          const locked = stage.slug !== "brainstorming" && !unlocked?.[stage.slug];
          const active = pathname.startsWith(`/${stage.slug}`);
          const status = statuses?.[stage.slug];
          const count = unread?.[stage.slug] ?? 0;
          const statusLabel =
            stage.slug === "initial-cut" && status === "stage-3" && remainingExecutiveSignoffs != null
              ? (executiveWaitPill(remainingExecutiveSignoffs) ?? undefined)
              : undefined;
          const body = (
            <>
              <span className="flex items-center gap-2">
                <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                <span className={cn("min-w-0 flex-1 truncate text-sm", active && "font-semibold")}>{stage.label}</span>
                {count > 0 ? (
                  <span className="rounded-md bg-[var(--brand-fill)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--on-brand)]">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </span>
              {status ? <StageStatusChip status={status} size="sm" label={statusLabel} /> : null}
            </>
          );
          const className = cn(
            "flex h-full min-h-[3.75rem] flex-col items-start justify-between gap-1.5 rounded-md border px-3 py-2 transition",
            active
              ? "border-[var(--brand-green)] bg-[rgb(43,179,110,0.08)] text-foreground"
              : "border-border text-foreground hover:bg-card",
            locked && "cursor-not-allowed opacity-45 hover:bg-transparent"
          );
          return (
            <li key={stage.slug} className="min-w-0">
              {locked ? (
                <span className={className} aria-disabled="true" title="Unlocks when the previous stage is approved">
                  {body}
                </span>
              ) : (
                <Link href={`/${stage.slug}` as never} className={className} aria-current={active ? "page" : undefined}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-[1_1_auto] flex-wrap items-center justify-end gap-1">
        <Link href="/information" className={secondaryLink(pathname.startsWith("/information"))}>
          <BookOpen className="h-4 w-4" aria-hidden />
          Cycle guide
        </Link>
        {showExtensionRequests ? (
          <Link
            href={"/extension-requests" as never}
            className={secondaryLink(pathname.startsWith("/extension-requests"))}
          >
            <Hourglass className="h-4 w-4" aria-hidden />
            Extension requests
            {extensionRequestsAwaiting > 0 ? (
              <span className="font-mono-broadcast text-[11px] tabular-nums">{extensionRequestsAwaiting}</span>
            ) : null}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
