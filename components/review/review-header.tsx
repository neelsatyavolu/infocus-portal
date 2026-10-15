"use client";

import { Children, useId, type ReactNode } from "react";
import { Download, GraduationCap, MoreHorizontal, RotateCw } from "lucide-react";
import { ActionBar, ActionBarDivider } from "@/components/kit/action-bar";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu, type MenuItem } from "@/components/kit/menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * The review's header plate: PageHeader's compact plate (square Ink 2 nameplate with the green
 * strip, same padding and rhythm) with two extras the review needs, the version picker beside
 * the title and the approval strip. Desktop, three rows so the video keeps its height: eyebrow +
 * status tags, title + picker, then the approval strip (or, without one, the line of context),
 * and the actions on the right (tools, a hairline, then the decisions with the one primary last;
 * the instruction is a short line under them). Below the split it keeps only the eyebrow,
 * tags, a two-line title and the line; the rest moves under the player.
 */
export function ReviewHeader({
  eyebrow,
  status,
  title,
  versionControls,
  description,
  descriptionOnPhone = true,
  approval,
  tools,
  decisions,
  decisionsHint
}: {
  eyebrow: ReactNode;
  status?: ReactNode;
  title: string;
  /** Version picker and "Go to latest" (desktop only). */
  versionControls?: ReactNode;
  description?: ReactNode;
  descriptionOnPhone?: boolean;
  /** The approval strip (desktop only). */
  approval?: ReactNode;
  tools?: ReactNode;
  decisions?: ReactNode[] | null;
  /** What to do with the decisions (desktop: a line under them, also their accessible description). */
  decisionsHint?: string | null;
}) {
  const hintId = useId();
  const hasTools = Children.toArray(tools).length > 0;
  const hasDecisions = Boolean(decisions && decisions.length > 0);
  const hint = hasDecisions && decisionsHint ? decisionsHint : null;
  // On a desktop the approval strip takes the line's place; below the split the line can be off.
  const showDescription = Boolean(description) && (descriptionOnPhone || !approval);
  return (
    <section className="brand-hero-panel flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-4 md:px-6">
      <div className="min-w-0 flex-[1_1_420px]">
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="eyebrow min-w-0 truncate">{eyebrow}</div>
          {status ? <div className="flex flex-wrap items-center gap-1.5">{status}</div> : null}
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="display-sm min-w-0 break-words text-foreground max-lg:line-clamp-2">{title}</h1>
          {versionControls ? <div className="hidden flex-wrap items-center gap-2 lg:flex">{versionControls}</div> : null}
        </div>
        {showDescription ? (
          <p
            className={cn(
              "mt-1.5 max-w-3xl text-sm text-[var(--ink-text)]",
              !descriptionOnPhone && "max-lg:hidden",
              approval ? "lg:hidden" : null
            )}
          >
            {description}
          </p>
        ) : null}
        {approval ? <div className="mt-3 hidden max-w-3xl lg:block">{approval}</div> : null}
      </div>
      {hasTools || hasDecisions ? (
        <div className="ml-auto hidden min-w-0 flex-col items-end gap-1.5 lg:flex">
          <ActionBar align="end" aria-label="Review actions">
            {tools}
            {hasTools && hasDecisions ? <ActionBarDivider /> : null}
            {hasDecisions ? (
              <div role="group" aria-label="Decision" aria-describedby={hint ? hintId : undefined} className="flex items-center gap-2">
                {decisions}
              </div>
            ) : null}
          </ActionBar>
          {/* What to do, right under the buttons it explains (phones get it in the decision card). */}
          {hint ? (
            <p id={hintId} className="max-w-[30rem] text-right text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export type ReviewToolsProps = {
  downloadHref: string | null;
  showGrades: boolean;
  gradesOpen: boolean;
  onToggleGrades: () => void;
  onRefresh: () => void;
};

/** The same green "on" tint as a pressed IconButton. */
const GRADES_ON_CLASS =
  "border-[var(--brand-green)]/40 bg-[rgb(43_179_110/0.12)] text-[var(--brand-green)] hover:bg-[rgb(43_179_110/0.18)] hover:text-[var(--brand-green)]";

/** Download · Grades · Refresh as matched outline controls (desktop header, tablet toolbar). */
export function reviewToolButtons({ downloadHref, showGrades, gradesOpen, onToggleGrades, onRefresh }: ReviewToolsProps): ReactNode[] {
  const tools: ReactNode[] = [];
  if (downloadHref) {
    tools.push(
      <a
        key="download"
        href={downloadHref}
        download
        className={buttonVariants({ variant: "outline" })}
        title="Download the original file of this version"
      >
        <Download aria-hidden />
        Download
      </a>
    );
  }
  if (showGrades) {
    tools.push(
      <Button
        key="grades"
        type="button"
        variant="outline"
        aria-pressed={gradesOpen}
        className={cn(gradesOpen && GRADES_ON_CLASS)}
        onClick={onToggleGrades}
        title="Quick grades"
      >
        <GraduationCap aria-hidden />
        Grades
      </Button>
    );
  }
  tools.push(<IconButton key="refresh" label="Refresh" icon={RotateCw} variant="outline" onClick={onRefresh} />);
  return tools;
}

function startDownload(href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Below the split: the version picker (fills the row), "Go to latest" on an older version, and
 * the tools — labeled from sm up, in a ⋯ menu on phones (just a Refresh button when that's the
 * only tool).
 */
export function ReviewPhoneToolbar({
  versionSelect,
  goToLatest,
  tools
}: {
  versionSelect: ReactNode;
  goToLatest?: ReactNode;
  tools: ReviewToolsProps;
}) {
  const onlyRefresh = !tools.downloadHref && !tools.showGrades;
  const menuItems: MenuItem[] = [
    {
      key: "download",
      label: "Download",
      icon: Download,
      hidden: !tools.downloadHref,
      onSelect: () => tools.downloadHref && startDownload(tools.downloadHref)
    },
    { key: "grades", label: "Quick grades", icon: GraduationCap, hidden: !tools.showGrades, onSelect: tools.onToggleGrades },
    { key: "refresh", label: "Refresh", icon: RotateCw, onSelect: tools.onRefresh }
  ];
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <div className="flex min-w-0 flex-1 *:min-w-0 *:flex-1">{versionSelect}</div>
      {goToLatest}
      <ActionBar size="touch" className="hidden sm:flex">
        {reviewToolButtons(tools)}
      </ActionBar>
      {onlyRefresh ? (
        <IconButton label="Refresh" icon={RotateCw} variant="outline" size="touch" className="sm:hidden" onClick={tools.onRefresh} />
      ) : (
        <ActionMenu
          label="More review tools"
          variant="outline"
          triggerIcon={MoreHorizontal}
          className="h-10 sm:hidden"
          items={menuItems}
        />
      )}
    </div>
  );
}

/**
 * Below the split: the approval path, the instruction line, and the decision buttons (two per
 * row, 40px), under the player, so people watch first and decide after.
 */
export function ReviewDecisionCard({
  approval,
  helper,
  decisions
}: {
  approval?: ReactNode;
  helper?: ReactNode;
  decisions?: ReactNode[] | null;
}) {
  const hasDecisions = Boolean(decisions && decisions.length > 0);
  if (!approval && !helper && !hasDecisions) {
    return null;
  }
  return (
    <section aria-label="Review decision" className="space-y-3 rounded-md border border-border bg-card p-4 lg:hidden">
      {approval}
      {helper ? <p className="text-sm text-[var(--ink-text)]">{helper}</p> : null}
      {hasDecisions ? (
        <div className="grid grid-cols-2 gap-2 *:h-auto *:min-h-10 *:w-full *:min-w-0 *:whitespace-normal *:py-2 *:leading-tight md:*:min-h-9 [&>*:last-child:nth-child(odd)]:col-span-2">
          {decisions}
        </div>
      ) : null}
    </section>
  );
}
