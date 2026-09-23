"use client";

import { useLayoutEffect, type ReactNode } from "react";
import Link from "next/link";
import { publishGroupBreadcrumbTopic } from "@/src/lib/app-breadcrumbs";
import {
  GROUP_NAV_SLUGS,
  GROUP_NAV_TAB_LABELS,
  groupNavTabDone,
  pendingGroupNavSlug,
  type GroupNavSlug,
  type GroupNavState
} from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";

type GroupStageShellProps = {
  rowId: string;
  stage: GroupNavSlug;
  groupTopic: string;
  cycleNumber: number;
  members: string;
  assignedProducer: string | null;
  assignedExecutive: string | null;
  nav: GroupNavState;
  children: ReactNode;
};

export function GroupStageShell({
  rowId,
  stage,
  groupTopic,
  cycleNumber,
  members,
  assignedProducer,
  assignedExecutive,
  nav,
  children
}: GroupStageShellProps) {
  const pendingSlug = pendingGroupNavSlug(nav);

  useLayoutEffect(() => {
    publishGroupBreadcrumbTopic(rowId, groupTopic);
    return () => {
      publishGroupBreadcrumbTopic(rowId, null);
    };
  }, [rowId, groupTopic]);

  return (
    <div className="route-enter mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-[80rem] flex-col space-y-4 pb-24">
      <div>
        <Link href={"/groups" as never} className="text-xs text-muted-foreground hover:text-foreground">
          ← Groups
        </Link>
        <h1 className="display-md mt-2 text-balance text-foreground">{groupTopic || "Untitled group"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cycle {cycleNumber}
          {members ? ` · ${members}` : ""}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          AP · {assignedProducer ?? "Unassigned"}
          <span className="mx-2 text-border">·</span>
          EP · {assignedExecutive ?? "Unassigned"}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      <section className="sticky bottom-4 z-20 mx-auto flex justify-center px-2">
        <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/85 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
          {GROUP_NAV_SLUGS.map((slug) => {
            const active = slug === stage;
            const done = groupNavTabDone(slug, nav);
            const pending = slug === pendingSlug;
            return (
              <Link
                key={slug}
                href={`/groups/${rowId}/${slug}` as never}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors sm:px-4 sm:text-[12px] sm:tracking-[0.18em]",
                  active
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-[var(--ink-text)] hover:bg-white/5 hover:text-white"
                )}
              >
                {GROUP_NAV_TAB_LABELS[slug]}
                {done ? (
                  <span className={cn("text-[10px]", active ? "text-[var(--ink)]/70" : "text-emerald-300/80")}>✓</span>
                ) : pending ? (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      active ? "bg-[var(--ink)]" : "bg-[var(--brand-green)]"
                    )}
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
