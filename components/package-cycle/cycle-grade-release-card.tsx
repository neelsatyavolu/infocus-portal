"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CYCLE_GRADE_FEEDBACK } from "@/src/lib/package-cycle-grades";
import { cn } from "@/src/lib/utils";

function formatDay(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function CycleGradeReleaseCard({
  feedback,
  published,
  publishedAt,
  saving,
  publishing,
  onSave,
  onPublish
}: {
  feedback: string;
  published: boolean;
  publishedAt: string | null;
  saving: boolean;
  publishing: boolean;
  onSave: (feedback: string) => void;
  onPublish: (feedback: string) => void;
}) {
  const [draft, setDraft] = useState(feedback);
  const publishedDay = formatDay(publishedAt);
  const dirty = draft !== feedback;
  const busy = saving || publishing;

  useEffect(() => {
    setDraft(feedback);
  }, [feedback]);

  return (
    <section className="flex min-h-full flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Cycle grade</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Same note for every producer. Students see it on Grades after you publish.
          </p>
        </div>
        <span className={cn("status-pill status-pill-sm shrink-0", published ? "status-approved" : "status-neutral")}>
          {published ? "Published" : "Hidden"}
        </span>
      </div>

      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={MAX_CYCLE_GRADE_FEEDBACK}
        rows={8}
        placeholder="Feedback for this group's cycle grade…"
        className="min-h-[10rem] flex-1 resize-y bg-black/30 light:bg-muted"
      />
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {published
            ? publishedDay
              ? `Visible on Grades since ${publishedDay}.`
              : "Visible on the student Grades tab."
            : "Students cannot see this cycle grade until you publish."}
        </span>
        <span>
          {draft.length}/{MAX_CYCLE_GRADE_FEEDBACK}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !dirty}
          onClick={() => onSave(draft)}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save feedback
        </Button>
        <Button type="button" disabled={busy || published} onClick={() => onPublish(draft)}>
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {published ? "Grades published" : "Publish Grades"}
        </Button>
      </div>
    </section>
  );
}
