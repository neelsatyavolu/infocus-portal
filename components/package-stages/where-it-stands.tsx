import type { ReactNode } from "react";
import { Alert } from "@/components/kit/alert";
import { Panel } from "@/components/kit/panel";
import { StepList, type StepState } from "@/components/kit/segment-nav";
import { StatusTag } from "@/components/kit/status-tag";
import type { ApprovalStep } from "@/components/package-stages/stage-status";

/** Sent back for changes shows as the kit's blocked step (Danger marker), not a plain current one. */
function stepState(step: ApprovalStep): StepState {
  return step.state === "current" && step.tone === "danger" ? "blocked" : step.state;
}

/**
 * The student rail's first panel: the next-step sentence, on Initial Cut the approval path
 * (Stage 1 producer → Stage 2 adviser → Stage 3 executives, as numbered steps with a state tag),
 * then the upload rule for this stage (a muted line, or a warning for the Final Cut once-only rule).
 */
export function WhereItStands({
  nextStep,
  approvalSteps,
  rule,
  warning,
  className
}: {
  nextStep: ReactNode;
  approvalSteps?: ApprovalStep[] | null;
  rule?: ReactNode;
  warning?: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      id="stage-where-it-stands"
      title="Where it stands"
      titleAs="h2"
      padding="md"
      className={className}
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-foreground">{nextStep}</p>
      {approvalSteps ? (
        <div className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">
            Approval path
          </h3>
          <StepList
            steps={approvalSteps.map((step) => ({
              key: step.key,
              title: step.label,
              state: stepState(step),
              tag: step.stateLabel ? (
                <StatusTag tone={step.tone} size="sm">
                  {step.stateLabel}
                </StatusTag>
              ) : undefined
            }))}
          />
        </div>
      ) : null}
      {rule ? <p className="text-[13px] leading-snug text-muted-foreground">{rule}</p> : null}
      {warning ? (
        <Alert tone="warning" compact role="note">
          {warning}
        </Alert>
      ) : null}
    </Panel>
  );
}
