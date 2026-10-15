"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { publishGroupBreadcrumbTopic } from "@/src/lib/app-breadcrumbs";
import { listShortcut, neighborIds, readGroupOrder } from "@/src/lib/keyboard-nav";
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
  const router = useRouter();
  const [neighbors, setNeighbors] = useState<{ previous: string | null; next: string | null }>({
    previous: null,
    next: null
  });

  // The Groups page saves the order it shows; step through it with Previous/Next or J/K.
  useEffect(() => {
    setNeighbors(neighborIds(readGroupOrder(window.sessionStorage), rowId));
  }, [rowId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = listShortcut(event);
      const target = shortcut === "next" ? neighbors.next : shortcut === "previous" ? neighbors.previous : null;
      if (!target) return;
      event.preventDefault();
      router.push(`/groups/${target}` as never);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [neighbors, router]);

  useLayoutEffect(() => {
    publishGroupBreadcrumbTopic(rowId, groupTopic);
    return () => {
      publishGroupBreadcrumbTopic(rowId, null);
    };
  }, [rowId, groupTopic]);

  const stepLink = (id: string | null, label: string, Icon: typeof ChevronLeft, keyHint: string) =>
    id ? (
      <Link
        href={`/groups/${id}` as never}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground transition hover:bg-card hover:text-foreground"
        aria-keyshortcuts={keyHint}
        title={`${label} (${keyHint})`}
      >
        {Icon === ChevronLeft ? <Icon className="h-4 w-4" aria-hidden /> : null}
        {label}
        {Icon === ChevronRight ? <Icon className="h-4 w-4" aria-hidden /> : null}
      </Link>
    ) : null;

  return (
    <div className="route-enter mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-[80rem] flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={"/groups" as never} className="text-xs text-muted-foreground hover:text-foreground">
            ← Groups
          </Link>
          <h1 className="display-md mt-2 text-balance text-foreground">{groupTopic || "Untitled group"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cycle {cycleNumber}
            {members ? ` · ${members}` : ""}
            <span className="mx-2 text-border">·</span>
            AP {assignedProducer ?? "Unassigned"}
            <span className="mx-2 text-border">·</span>
            EP {assignedExecutive ?? "Unassigned"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stepLink(neighbors.previous, "Previous group", ChevronLeft, "K")}
          {stepLink(neighbors.next, "Next group", ChevronRight, "J")}
        </div>
      </div>

      <nav aria-label="Stages" className="flex gap-2 overflow-x-auto">
        {GROUP_NAV_SLUGS.map((slug) => {
          const active = slug === stage;
          const done = groupNavTabDone(slug, nav);
          const pending = slug === pendingSlug;
          return (
            <Link
              key={slug}
              href={`/groups/${rowId}/${slug}` as never}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition",
                active
                  ? "border-[var(--brand-green)] bg-[rgb(43,179,110,0.08)] font-semibold text-foreground"
                  : "border-border text-muted-foreground hover:bg-card hover:text-foreground"
              )}
            >
              {GROUP_NAV_TAB_LABELS[slug]}
              {done ? (
                <span className="text-[11px] text-[var(--brand-green)]" aria-label="done">
                  ✓
                </span>
              ) : pending ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]" aria-label="current" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
