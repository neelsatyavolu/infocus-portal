"use client";

import { Fragment, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { StickyActionBar } from "@/components/kit/sticky-action-bar";
import { PageHeader } from "@/components/page-header";
import type { DecisionAction } from "@/components/package-stages/stage-decision-actions";
import { cn } from "@/src/lib/utils";

/**
 * The student stage page's nameplate: "Cycle 03 · Initial Cut" eyebrow with the stage status
 * tag, the package topic as the title, one line of context (`description`: the group and its
 * producer), and one matched action row (Refresh icon, Give feedback when enabled, one primary).
 * The row is h-9, and 40px on phones: pass `max-sm:h-10` on each action (PageHeader holds
 * children to h-9). Brainstorming passes `nextStep` and `people` instead of `description`.
 */
export function StudentStageHeader({
  eyebrow,
  status,
  title,
  description,
  nextStep,
  people,
  refreshing,
  onRefresh,
  actions
}: {
  eyebrow: ReactNode;
  status?: ReactNode;
  title: string;
  /** One line of context. */
  description?: ReactNode;
  /** Without `description`: the next-step sentence… */
  nextStep?: ReactNode;
  /** …and a muted line naming the group and its producer. */
  people?: ReactNode;
  refreshing: boolean;
  onRefresh?: () => void;
  /** After Refresh: Give feedback, then the one primary. */
  actions?: ReactNode;
}) {
  return (
    <PageHeader
      eyebrow={<span className="min-w-0 truncate">{eyebrow}</span>}
      status={status}
      title={title}
      description={
        description ??
        (nextStep || people ? (
          <>
            {nextStep ? <p className="text-[var(--ink-text)]">{nextStep}</p> : null}
            {people ? <p className="mt-0.5 text-[13px] text-muted-foreground">{people}</p> : null}
          </>
        ) : undefined)
      }
      actions={
        onRefresh || actions ? (
          <>
            {onRefresh ? (
              <IconButton
                label="Refresh"
                icon={RotateCw}
                variant="outline"
                busy={refreshing}
                onClick={onRefresh}
                className="max-sm:h-10"
              />
            ) : null}
            {actions}
          </>
        ) : undefined
      }
    />
  );
}

const ROW = "flex min-w-0 flex-wrap items-center gap-2 *:h-9 max-sm:w-full max-sm:*:h-10 max-sm:*:flex-1 sm:ml-auto";

function ActionRow({ actions, className }: { actions: DecisionAction[]; className?: string }) {
  if (actions.length === 0) return null;
  return (
    <div className={cn(ROW, className)}>
      {actions.map((action) => (
        <Fragment key={action.key}>{action.node}</Fragment>
      ))}
    </div>
  );
}

function isDecisionList(value: unknown): value is DecisionAction[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "object" && item !== null && "key" in item && "node" in item)
  );
}

/**
 * Producer decision bar (Groups → group → stage): one line under the GroupStageShell tabs with
 * the status tags and progress sentence on the left and the stage's decisions on the right
 * (h-9, at most one primary). With decisions it sticks to the top on desktop for long clip grids. Below lg the
 * main decisions move to the kit's StickyActionBar above the phone tab bar so they stay in
 * reach; the rest stay in the bar.
 * - `actions` as a DecisionAction list: each entry with `dock` is pinned on phones.
 * - `actions` as plain nodes (Groups early stages): `phoneDock` pins all of them.
 * The dock brings an in-flow spacer (an `aria-hidden` sibling right after the bar) that must sit at
 * the end of the page: put the bar in a flex column with `[&>[aria-hidden]]:order-last`.
 */
export function DecisionBar({
  heading,
  status,
  progress,
  note,
  actions,
  phoneDock = false
}: {
  /** Screen-reader heading ("Initial Cut · Stage 1"); the shell above already shows it. */
  heading: string;
  status?: ReactNode;
  progress?: ReactNode;
  /** Extra muted line (e.g. "This package is in Stage 2 · Go to Initial 2"). */
  note?: ReactNode;
  actions?: DecisionAction[] | ReactNode;
  /** Plain-node `actions` only: pin them all above the phone tab bar. */
  phoneDock?: boolean;
}) {
  const list: DecisionAction[] = isDecisionList(actions)
    ? actions
    : actions
      ? [{ key: "actions", node: actions, dock: phoneDock }]
      : [];
  const docked = list.filter((action) => action.dock);
  const inline = list.filter((action) => !action.dock);
  return (
    <>
      <section
        aria-label={heading}
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-md border border-border bg-card px-4 py-3",
          // Only a bar with decisions stays in reach on desktop; a read-only one scrolls away.
          list.length > 0 && "z-20 lg:sticky lg:top-[var(--app-header-h,0px)]"
        )}
      >
        <h2 className="sr-only">{heading}</h2>
        <div className="flex min-w-0 flex-[1_1_20rem] flex-wrap items-center gap-x-3 gap-y-1.5">
          {status ? <div className="flex flex-wrap items-center gap-1.5">{status}</div> : null}
          {progress ? <p className="min-w-0 text-sm text-[var(--ink-text)]">{progress}</p> : null}
          {note ? (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
              {note}
            </div>
          ) : null}
        </div>
        {docked.length > 0 ? (
          <>
            <ActionRow actions={list} className="max-lg:hidden" />
            <ActionRow actions={inline} className="lg:hidden" />
          </>
        ) : (
          <ActionRow actions={list} />
        )}
      </section>
      {docked.length > 0 ? (
        // Phones and tablets only: from lg the same decisions sit in the bar above.
        <StickyActionBar className="lg:hidden">
          {docked.map((action) => (
            <Fragment key={action.key}>{action.node}</Fragment>
          ))}
        </StickyActionBar>
      ) : null}
    </>
  );
}
