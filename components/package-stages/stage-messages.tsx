"use client";

import { Lock, RotateCw, Users } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { cycleLabel } from "@/components/kit/format";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import ProducerFeedbackDialog from "@/components/package-cycle/producer-feedback-dialog";
import { Button } from "@/components/ui/button";
import { StudentStageHeader } from "@/components/package-stages/stage-header";
import { lockedStageSentence } from "@/components/package-stages/stage-status";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import { PRODUCER_FEEDBACK_ENABLED } from "@/src/lib/producer-feedback";
import { cn } from "@/src/lib/utils";

type MessageKind = "error" | "empty" | "locked";

/**
 * A stage page with nothing to work on yet: a failed first load (Try again), not on a package
 * this cycle, or a stage that is still locked. The header stays so the page always has its title:
 * with a package (locked) it reads like the stage page ("Cycle 03 · Initial Cut" over the topic),
 * without one the stage name is the title.
 */
export function StageMessage({
  kind,
  slug,
  title,
  embedded,
  producerChrome,
  cycleNumber,
  topic,
  error,
  refreshing,
  onRetry
}: {
  kind: MessageKind;
  slug: CycleStageSlug;
  title: string;
  embedded: boolean;
  producerChrome: boolean;
  cycleNumber?: number;
  topic?: string | null;
  error?: string | null;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const lockedTag =
    kind === "locked" ? (
      <StatusTag tone="muted" icon={Lock}>
        Locked
      </StatusTag>
    ) : null;
  // Embedded in Groups, GroupStageShell above already names the group and the stage.
  const header = embedded ? null : (
    <StudentStageHeader
      eyebrow={cycleNumber ? `${cycleLabel(cycleNumber)} · ${title}` : "My package"}
      status={lockedTag}
      title={cycleNumber ? topic || "My package" : title}
      refreshing={refreshing}
      onRefresh={!producerChrome && kind === "locked" ? onRetry : undefined}
      actions={
        PRODUCER_FEEDBACK_ENABLED && !producerChrome && kind === "empty" ? (
          <ProducerFeedbackDialog triggerClassName="max-sm:h-10" />
        ) : null
      }
    />
  );

  let body;
  if (kind === "error") {
    body = <ErrorState title="Couldn't load this stage." message={error} onRetry={onRetry} busy={refreshing} />;
  } else if (kind === "locked") {
    body = <EmptyState icon={Lock} title="This stage is locked." description={lockedStageSentence(slug)} />;
  } else {
    body = (
      <EmptyState
        icon={Users}
        title="You are not on a package group this cycle."
        description="Your stage work shows here once you're on a package group's roster."
        action={
          producerChrome ? null : (
            <Button type="button" variant="outline" disabled={refreshing} onClick={onRetry}>
              {refreshing ? <Spinner /> : <RotateCw aria-hidden />}
              Refresh
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className={cn("space-y-5", !embedded && "route-enter")}>
      {header}
      <section aria-label={title} className="rounded-md border border-border bg-card">
        {body}
      </section>
    </div>
  );
}
