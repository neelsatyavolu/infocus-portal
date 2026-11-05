"use client";

import Link from "next/link";
import { AlertTriangle, BookOpen, Check, Clock, Hourglass, Lock, type LucideIcon } from "lucide-react";
import { CountBadge, StatusDot } from "@/components/kit/status-tag";
import { toneTextClass, type StatusTone } from "@/components/kit/tone";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { stageStatusLabel, stageStatusTone } from "@/components/package-stages/stage-status";
import { useStageChanges } from "@/components/package-stages/use-stage-changes";
import type { StageCommentUnread } from "@/src/lib/package-stage-comments";
import type { CycleStageStatus } from "@/src/lib/package-stage-status";
import { cn } from "@/src/lib/utils";

type StageSlug = "brainstorming" | "a-roll" | "initial-cut" | "final-cut";

const STAGES: Array<{ slug: StageSlug; label: string; short: string }> = [
  { slug: "brainstorming", label: "Brainstorming", short: "Brainstorm" },
  { slug: "a-roll", label: "A-roll/B-roll", short: "A/B-roll" },
  { slug: "initial-cut", label: "Initial Cut", short: "Initial" },
  { slug: "final-cut", label: "Final Cut", short: "Final" }
];

const STATUS_ICON: Partial<Record<CycleStageStatus, LucideIcon>> = {
  approved: Check,
  "stage-1-approved": Check,
  queued: Check,
  "needs-revisions": AlertTriangle,
  submitted: Clock,
  "stage-2": Clock,
  "stage-3": Clock,
  locked: Lock
};

/**
 * Segment top rule: done stages solid green, the rest a hairline. It says where the work is, not
 * which page is open (Light mode draws both greens the same), as on Groups' stage bar.
 */
function ruleClass(status: CycleStageStatus | undefined) {
  if (status === "approved" || status === "queued") return "border-t-[var(--brand-fill)]";
  return "border-t-[var(--ink-4)]";
}

/** Status words in the stage bar: green when done, danger for revisions, amber when waiting on a reviewer. */
function wordTone(status: CycleStageStatus): StatusTone {
  if (status === "submitted") return "warning";
  if (status === "pending" || status === "locked") return "muted";
  return stageStatusTone(status);
}

/** The open stage or page: the same 8% green tint everywhere (follows --brand-green in Light mode). */
const ACTIVE_TINT = "bg-brand-green/8";

/** In the strip, the open page also gets Groups' 2px green underline (the cell must be `relative`). */
const ACTIVE = cn(
  ACTIVE_TINT,
  "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--brand-green)]"
);

const LOCKED_HINT = "Unlocks when the previous stage is approved";

const UTILITY_CELL =
  "relative flex h-16 w-12 min-w-0 items-center justify-center gap-2 px-2.5 text-sm transition-colors xl:w-auto xl:justify-start xl:px-3";

type Utility = { href: string; label: string; icon: LucideIcon; active: boolean; count?: number };

/** From sm: a cell in the strip's row (icon only until xl, with a tooltip). */
function UtilityCell({ href, label, icon: Icon, active, count }: Utility) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href as never}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            UTILITY_CELL,
            active
              ? cn(ACTIVE, "font-semibold text-foreground")
              : "text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
          )}
        >
          <Icon aria-hidden className={cn("h-4 w-4 shrink-0", active && "text-[var(--brand-green)]")} />
          <span className="hidden truncate xl:inline">{label}</span>
          {count ? (
            <CountBadge
              count={count}
              tone="neutral"
              srLabel={`${count} awaiting`}
              className="max-xl:absolute max-xl:right-0 max-xl:top-1"
            />
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent className="xl:hidden">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Below sm: a small ghost link (icon and label) in the row under the strip. */
function UtilityRowLink({ href, label, icon: Icon, active, count }: Utility) {
  return (
    <Link
      href={href as never}
      aria-current={active ? "page" : undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        active ? cn(ACTIVE_TINT, "font-semibold text-foreground") : "text-muted-foreground"
      )}
    >
      <Icon aria-hidden className={cn("h-4 w-4", active && "text-[var(--brand-green)]")} />
      {label}
      {count ? <CountBadge count={count} tone="neutral" srLabel={`${count} awaiting`} /> : null}
    </Link>
  );
}

/**
 * The stage bar on every student package page, in the shell's content column: one flat segment
 * per stage (number, status icon and word, name, unread feedback count, and a green dot when the
 * status changed since that stage was last opened in this browser), then Cycle guide and, for students,
 * Extension requests. Later stages stay disabled until they unlock. From sm it is one row (the
 * two links icon-only until xl). On phones the four stages keep the whole width: line 1 holds the
 * number, status icon, dot and count (the word stays for screen readers), line 2 the short name
 * alone, and the two links sit in a small row under the strip.
 */
export function PackageStageNav({
  pathname,
  unlocked,
  statuses,
  unread,
  remainingExecutiveSignoffs,
  extensionRequestsAwaiting,
  showExtensionRequests,
  viewer
}: {
  pathname: string;
  unlocked: { "a-roll": boolean; "initial-cut": boolean; "final-cut": boolean } | null;
  statuses: Record<StageSlug, CycleStageStatus> | null;
  unread: StageCommentUnread | null;
  remainingExecutiveSignoffs: number | null;
  extensionRequestsAwaiting: number;
  showExtensionRequests: boolean;
  /**
   * The signed-in (or viewed-as) email: keeps each person's "changed since your last visit" record
   * apart. Without it the record is shared by everyone who uses this browser.
   */
  viewer?: string | null;
}) {
  const activeSlug = STAGES.find((stage) => pathname.startsWith(`/${stage.slug}`))?.slug ?? null;
  const changed = useStageChanges(statuses, activeSlug, viewer);
  const utilities: Utility[] = [
    { href: "/information", label: "Cycle guide", icon: BookOpen, active: pathname.startsWith("/information") },
    ...(showExtensionRequests
      ? [
          {
            href: "/extension-requests",
            label: "Extension requests",
            icon: Hourglass,
            active: pathname.startsWith("/extension-requests"),
            count: extensionRequestsAwaiting
          }
        ]
      : [])
  ];

  return (
    <nav aria-label="Package stages" className="mb-5 min-w-0">
      <div className="flex min-w-0 items-stretch gap-2">
        <ol className="grid min-w-0 flex-1 grid-cols-4 gap-1 sm:gap-2">
          {STAGES.map((stage, index) => {
            const locked = stage.slug !== "brainstorming" && !unlocked?.[stage.slug];
            const active = stage.slug === activeSlug;
            const status = statuses?.[stage.slug];
            const count = unread?.[stage.slug] ?? 0;
            const Icon = status ? STATUS_ICON[status] : undefined;
            const word = status
              ? stageStatusLabel(status, stage.slug === "initial-cut" ? remainingExecutiveSignoffs : null)
              : null;
            const tone = status ? wordTone(status) : "muted";
            const isChanged = changed.has(stage.slug) && !active;
            // The dot and the count: on line 1 on phones (where the word is hidden), on line 2 from sm.
            const marks = (where: string) =>
              isChanged || count > 0 ? (
                <span className={cn("flex shrink-0 items-center gap-1.5", where)}>
                  {isChanged ? <StatusDot tone="new" label="Status changed since your last visit" /> : null}
                  <CountBadge count={count} srLabel={`${count} unread`} />
                </span>
              ) : null;
            const body = (
              <>
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase leading-none tracking-[0.11em]",
                    toneTextClass(tone)
                  )}
                >
                  <span className="font-mono-broadcast tabular-nums text-muted-foreground">{index + 1}</span>
                  {Icon ? <Icon aria-hidden className="h-3 w-3 shrink-0" /> : null}
                  {word ? (
                    <>
                      <span className="hidden min-w-0 truncate sm:inline">{word}</span>
                      <span className="sr-only sm:hidden">{word}</span>
                    </>
                  ) : null}
                  {marks("ml-auto normal-case tracking-normal sm:hidden")}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs sm:text-sm",
                      active ? "font-semibold text-foreground" : locked ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    <span className="md:hidden">{stage.short}</span>
                    <span className="hidden md:inline">{stage.label}</span>
                  </span>
                  {marks("max-sm:hidden")}
                </span>
              </>
            );
            const className = cn(
              "relative flex h-14 min-w-0 flex-col justify-center gap-1.5 border-t-4 px-1 transition-colors sm:h-16 sm:px-3",
              ruleClass(status),
              active ? ACTIVE : !locked && "hover:bg-[var(--ink-3)]",
              locked && "cursor-not-allowed opacity-50"
            );
            return (
              <li key={stage.slug} className="min-w-0">
                {locked ? (
                  <span className={className} aria-disabled="true" title={LOCKED_HINT}>
                    {body}
                    <span className="sr-only">{`. ${LOCKED_HINT}.`}</span>
                  </span>
                ) : (
                  <Link
                    href={`/${stage.slug}` as never}
                    className={className}
                    title={word ? `${stage.label} · ${word}` : stage.label}
                    aria-current={active ? "page" : undefined}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex shrink-0 items-center gap-2 border-l border-border pl-2 max-sm:hidden">
          {utilities.map((utility) => (
            <UtilityCell key={utility.href} {...utility} />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1 sm:hidden">
        {utilities.map((utility) => (
          <UtilityRowLink key={utility.href} {...utility} />
        ))}
      </div>
    </nav>
  );
}
