"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { DecisionLeadProvider, useDecisionLeadHost } from "@/components/package-stages/decision-lead";
import { PageHeader } from "@/components/page-header";
import { publishGroupBreadcrumbTopic } from "@/src/lib/app-breadcrumbs";
import type { GroupNavSlug } from "@/src/lib/package-stages";
import { ApprovalPath, GroupStageBar } from "./group-stage-bar";
import {
  GroupStageStateContext,
  useGroupStageChanges,
  useGroupStageOverrides,
  useRefreshAfterStageWrites
} from "./group-stage-state";
import { GroupStepper, useGroupOrder } from "./group-stepper";
import {
  applyFlagOverrides,
  approvalPathSteps,
  groupStageCells,
  isInitialSlug,
  isWorkspaceSlug,
  type GroupStageFacts
} from "./stage-bar-model";
import { cellSignatures } from "./stage-changes";

type GroupStageShellProps = {
  rowId: string;
  stage: GroupNavSlug;
  groupTopic: string;
  cycleNumber: number;
  members: string;
  assignedProducer: string | null;
  assignedExecutive: string | null;
  facts: GroupStageFacts;
  children: ReactNode;
};

/**
 * "Abby, Otto · AP Sage · EP unassigned". Unassigned is a plain word, not a warning: assigning an
 * EP clears the AP, and an unassigned group falls back to its category's associate.
 */
function peopleLine(members: string, assignedProducer: string | null, assignedExecutive: string | null) {
  return [members, `AP ${assignedProducer ?? "unassigned"}`, `EP ${assignedExecutive ?? "unassigned"}`]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A group's stage pages: the compact header plate (cycle, topic, people, Previous/Next with the
 * queue position), the five-stage bar with statuses, Initial Cut's approval stages on its
 * routes, then the stage itself. A wide route: the app shell gives it the full width.
 */
export function GroupStageShell({
  rowId,
  stage,
  groupTopic,
  cycleNumber,
  members,
  assignedProducer,
  assignedExecutive,
  facts,
  children
}: GroupStageShellProps) {
  const stageState = useGroupStageOverrides(facts);
  const order = useGroupOrder(rowId);
  useRefreshAfterStageWrites(rowId, isWorkspaceSlug(stage));

  useLayoutEffect(() => {
    publishGroupBreadcrumbTopic(rowId, groupTopic);
    return () => {
      publishGroupBreadcrumbTopic(rowId, null);
    };
  }, [rowId, groupTopic]);

  const current = applyFlagOverrides(facts, stageState.overrides);
  const cells = groupStageCells(rowId, stage, current);
  const steps = isInitialSlug(stage) ? approvalPathSteps(rowId, stage, current) : null;
  const activeKey = cells.find((cell) => cell.active)?.key ?? null;
  const changed = useGroupStageChanges(rowId, cellSignatures(cells, current), activeKey);
  // Hidden only when this group isn't in the saved list (opened from an email or push link).
  const showStepper = !order.ready || order.index > 0;
  // The stage's decision bar takes the approval path into its own block (steps beside the
  // decisions); until it does, the path sits under the stage bar.
  const lead = useDecisionLeadHost(steps ? <ApprovalPath steps={steps} /> : null);

  return (
    <GroupStageStateContext.Provider value={stageState}>
      <DecisionLeadProvider value={lead.value}>
        {/* No entrance transform here: it would pin the phone decision dock to this div (template.tsx fades the page). */}
        <div className="flex min-w-0 flex-col gap-5">
          <PageHeader
            size="compact"
            eyebrow={`Cycle ${cycleNumber}`}
            title={groupTopic || "Untitled group"}
            description={peopleLine(members, assignedProducer, assignedExecutive)}
            actions={showStepper ? <GroupStepper order={order} /> : undefined}
          />
          {/* Initial Cut's approval steps sit close under the bar: its sub-steps, not more stages. */}
          <div className="space-y-3">
            <GroupStageBar cells={cells} changed={changed} />
            {steps && !lead.claimed ? <ApprovalPath steps={steps} /> : null}
          </div>
          {/*
            The hosted StageWorkspace also draws a read-only approval path under the newest cut.
            The linked one above replaces it on these routes, so hide that copy (two paths built
            from different data could disagree). Cross-screen request: skip it when `embedded`.
          */}
          <div className="min-w-0 [&_ol[aria-label^=Approval]]:hidden">{children}</div>
        </div>
      </DecisionLeadProvider>
    </GroupStageStateContext.Provider>
  );
}
