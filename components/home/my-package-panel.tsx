import Link from "next/link";
import type { ReactNode } from "react";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { toneTextClass } from "@/components/kit/tone";
import { extensionsTone } from "@/components/home/home-format";
import { StageSteps } from "@/components/home/stage-steps";
import type { HomeStageStep } from "@/src/lib/home-stages";
import type { DashboardUpNext } from "@/src/server/dashboard-data";
import { cn } from "@/src/lib/utils";

function StatCell({ label, href, children }: { label: string; href?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative flex min-h-16 min-w-0 flex-col justify-start gap-1 px-3 py-3 first:rounded-bl-md first:pl-4 last:rounded-br-md md:px-5 md:first:pl-5",
        href && "transition-colors hover:bg-[var(--ink-3)]"
      )}
    >
      <dt className="truncate text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm leading-snug text-foreground">
        {href ? (
          <Link
            href={href as never}
            className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
          >
            {children}
          </Link>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}

/**
 * The student's package progress: the four stages as links, then a strip of three numbers
 * pinned to the bottom edge (check-ins, unread feedback, extension days). The topic and the
 * people are in the page header above it, and the stage strip marks the current stage, so the
 * panel's header is just its name: one title row, like Grade beside it, so both bodies start
 * on one line.
 * The strip is flush with the Panel's edges (its negative margins mirror Panel's
 * `p-4 md:p-5`); labels sit on one top line in every cell, and phones get the short value
 * text so nothing wraps. `unreadFeedback` and `extensions` are null when the snapshot
 * couldn't be loaded.
 */
export function MyPackagePanel({
  upNext,
  steps,
  unreadFeedback,
  extensions,
  className
}: {
  upNext: DashboardUpNext;
  steps: HomeStageStep[];
  unreadFeedback: number | null;
  extensions: { remaining: number; bank: number } | null;
  className?: string;
}) {
  const current = steps.find((step) => step.tone === "current") ?? null;
  const extensionTone = extensions ? extensionsTone(extensions.remaining) : undefined;

  return (
    <Panel
      id="home-my-package"
      title="My package"
      titleAs="h2"
      className={className}
      bodyClassName="flex flex-col gap-4"
    >
      <StageSteps steps={steps} />
      <dl className="-mx-4 -mb-4 mt-auto grid grid-cols-3 divide-x divide-border border-t border-border md:-mx-5 md:-mb-5">
        <StatCell label="Check-ins">
          <span className="font-mono-broadcast text-[13px] tabular-nums">
            {upNext.checkInsDone} / {upNext.checkInsTotal}
          </span>
        </StatCell>
        <StatCell label="Feedback" href={current?.href ?? "/brainstorming"}>
          {unreadFeedback === null ? (
            <span className="text-muted-foreground">—</span>
          ) : unreadFeedback > 0 ? (
            <StatusTag tone="success">{`${unreadFeedback} unread`}</StatusTag>
          ) : (
            <span className="text-muted-foreground">
              <span className="sm:hidden">None</span>
              <span className="max-sm:hidden">No unread notes</span>
            </span>
          )}
        </StatCell>
        <StatCell label="Extensions" href="/extension-requests">
          {extensions ? (
            <>
              <span className={cn("font-mono-broadcast text-[13px] tabular-nums", extensionTone && toneTextClass(extensionTone))}>
                {extensions.remaining} / {extensions.bank}
              </span>{" "}
              <span className="text-muted-foreground max-sm:sr-only">days left</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </StatCell>
      </dl>
    </Panel>
  );
}
