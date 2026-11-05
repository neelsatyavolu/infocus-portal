"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Panel } from "@/components/kit/panel";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CYCLE_GRADE_FEEDBACK } from "@/src/lib/package-cycle-grades";

function formatDay(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The shared cycle grade note (same for every producer) and Publish grades. Publish is the
 * page's primary action only when `publishPrimary` (every member has an official grade). Once
 * published, the PUBLISHED tag and the footer line say so; the Publish button goes away (it can't
 * be undone here, and status is never a disabled button).
 */
export function CycleGradeReleaseCard({
  feedback,
  published,
  publishedAt,
  saving,
  publishing,
  publishPrimary = false,
  onSave,
  onPublish
}: {
  feedback: string;
  published: boolean;
  publishedAt: string | null;
  saving: boolean;
  publishing: boolean;
  publishPrimary?: boolean;
  onSave: (feedback: string) => void;
  onPublish: (feedback: string) => void;
}) {
  const [draft, setDraft] = useState(feedback);
  const [prevFeedback, setPrevFeedback] = useState(feedback);
  if (feedback !== prevFeedback) {
    setPrevFeedback(feedback);
    setDraft(feedback);
  }
  const publishedDay = formatDay(publishedAt);
  const dirty = draft !== feedback;
  const busy = saving || publishing;

  return (
    <Panel
      id="cycle-grade"
      title="Cycle grade"
      titleAs="h2"
      status={<StatusTag tone={published ? "success" : "neutral"}>{published ? "Published" : "Hidden"}</StatusTag>}
      description="Same note for every producer."
      padding="md"
      footer={
        <>
          <span className="min-w-0">
            {published
              ? publishedDay
                ? `Visible on Grades since ${publishedDay}.`
                : "Visible on the student Grades tab."
              : "Students cannot see this cycle grade until you publish."}
          </span>
          <div className="flex flex-wrap items-center gap-2 *:h-9">
            <span className="inline-flex items-center font-mono-broadcast text-xs tabular-nums">
              {draft.length}/{MAX_CYCLE_GRADE_FEEDBACK}
            </span>
            <Button type="button" variant="outline" disabled={busy || !dirty} onClick={() => onSave(draft)}>
              {saving ? <Spinner /> : null}
              Save feedback
            </Button>
            {published ? null : (
              <Button
                type="button"
                variant={publishPrimary ? "default" : "outline"}
                disabled={busy}
                onClick={() => onPublish(draft)}
              >
                {publishing ? <Spinner /> : <Send aria-hidden />}
                Publish grades
              </Button>
            )}
          </div>
        </>
      }
    >
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={MAX_CYCLE_GRADE_FEEDBACK}
        rows={6}
        aria-label="Cycle grade feedback"
        placeholder="Feedback for this group's cycle grade…"
        className="resize-y"
      />
    </Panel>
  );
}
