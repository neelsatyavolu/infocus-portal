"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/kit/alert";
import { Disclosure, DisclosureToggle } from "@/components/kit/disclosure";
import { Panel } from "@/components/kit/panel";
import { MetricStrip } from "@/components/kit/stat-tile";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { QUALITY_DIMENSIONS } from "@/src/lib/associate-feedback-quality";
import type { AssociatePerformance } from "@/src/lib/associate-performance";
import { associateStageHref, associateStageLabel } from "./associates-overview";

const RECENT_FEEDBACK_PREVIEW = 5;

function evaluateLabel(busy: boolean, status: AssociatePerformance["quality"]["status"]) {
  if (busy) return "Evaluating…";
  if (status === "pending") return "Check evaluation";
  if (status === "unavailable") return "Try again";
  return "Score feedback";
}

function QualityPanel({ associate, evaluate }: { associate: AssociatePerformance; evaluate: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quality = associate.quality;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await evaluate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to score feedback.");
    } finally {
      setBusy(false);
    }
  }

  const canEvaluate = quality.status !== "ready" && quality.status !== "no_feedback";
  return (
    <Panel
      title="Feedback quality"
      eyebrow="AI assessment"
      padding="lg"
      actions={
        canEvaluate ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
            {evaluateLabel(busy, quality.status)}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono-broadcast text-[22px] font-medium tabular-nums text-foreground">{quality.score ?? "—"}</span>
          <span className="font-mono-broadcast text-[13px] tabular-nums">/100</span> · 25% of overall
        </p>
        <p className="text-[13px] text-muted-foreground" role="status">
          {busy ? "Applying the same rubric to the anonymized feedback sample…" : quality.message}
        </p>
        {error ? <Alert tone="danger" compact>{error}</Alert> : null}
        {quality.dimensions ? (
          <MetricStrip
            columns={4}
            items={(Object.keys(QUALITY_DIMENSIONS) as Array<keyof typeof QUALITY_DIMENSIONS>).map((key) => ({
              key,
              label: key,
              value: quality.dimensions![key],
              unit: "/100",
              hint: `${QUALITY_DIMENSIONS[key]}% of quality`
            }))}
          />
        ) : null}
        <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
          {quality.sampledNotes} of {quality.totalNotes} notes sampled across groups and stages. Names and links are removed before
          scoring. This evaluates written usefulness, not the correctness of advice about unseen footage. Model assessments can be
          wrong; inspect the evidence below.
        </p>
        <p className="max-w-prose text-xs text-muted-foreground">
          <span className="font-mono-broadcast">
            {quality.model} · {quality.rubric}
            {quality.evaluatedAt ? ` · ${new Date(quality.evaluatedAt).toLocaleString()}` : ""}
          </span>
          . Automatically refreshed daily starting at midnight Pacific, with 30 minutes between producers. Saved results remain
          visible between refreshes.
        </p>
        {quality.items.length > 0 ? (
          <Disclosure summary="Assessment evidence" count={quality.items.length} bodyClassName="space-y-3">
            {quality.items.map((item) => (
              <article key={item.ref} className="rounded-md border border-border p-3 text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    {associate.feedback.find((note) => note.id === item.noteId)?.topic ?? "Group feedback"} · {associateStageLabel(item.stage)}
                  </span>
                  <span className="shrink-0 font-mono-broadcast text-xs tabular-nums">{item.score}/100</span>
                </div>
                <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted-foreground">“{item.quote}”</blockquote>
                <p className="mt-2 leading-relaxed">{item.reason}</p>
              </article>
            ))}
          </Disclosure>
        ) : null}
      </div>
    </Panel>
  );
}

function GroupReviewsPanel({ groupFeedback }: { groupFeedback: AssociatePerformance["groupFeedback"] }) {
  return (
    <Panel
      title="Anonymous group reviews"
      padding="lg"
      description={
        <>
          <span className="font-mono-broadcast tabular-nums text-foreground">{groupFeedback.score ?? "—"}</span>
          <span className="font-mono-broadcast tabular-nums">/100</span> · 10% weight
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
          Only executive producers can read these. The group is identified; the submitting member is not recorded. Each group counts once.
        </p>
        {groupFeedback.reviews.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-5 text-center text-[13px] text-muted-foreground">
            No group reviews for this cycle yet. Missing reviews do not reduce the score.
          </p>
        ) : (
          <ul className="space-y-3">
            {groupFeedback.reviews.map((review) => (
              <li key={review.rowId} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h5 className="text-sm font-medium">{review.groupTopic}</h5>
                  <time className="text-xs text-muted-foreground" dateTime={review.updatedAt}>
                    {new Date(review.updatedAt).toLocaleDateString()}
                  </time>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusTag>Helpful {review.helpfulness}/5</StatusTag>
                  <StatusTag>Communication {review.communication}/5</StatusTag>
                  <StatusTag>Support {review.support}/5</StatusTag>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{review.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function RecentFeedbackPanel({ feedback }: { feedback: AssociatePerformance["feedback"] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? feedback : feedback.slice(0, RECENT_FEEDBACK_PREVIEW);
  return (
    <Panel title="Producer’s recent feedback" eyebrow="Latest 20" padding="none">
      {feedback.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground md:px-5">No written feedback recorded for these stages.</p>
      ) : (
        <>
          <ul id="associate-recent-feedback" className="divide-y divide-border">
            {shown.map((note) => (
              <li key={note.id} className="px-4 py-3 md:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <Link className="hover:text-[var(--brand-green)]" href={associateStageHref(note.rowId, note.stage) as never}>
                    {note.topic} · {associateStageLabel(note.stage)}
                  </Link>
                  <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString()}</time>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{note.body}</p>
              </li>
            ))}
          </ul>
          {feedback.length > RECENT_FEEDBACK_PREVIEW ? (
            <DisclosureToggle
              open={showAll}
              onToggle={() => setShowAll((value) => !value)}
              controls="associate-recent-feedback"
              closedLabel={`Show all ${feedback.length}`}
              openLabel="Show fewer"
              className="border-t border-border"
            />
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** Feedback tab of the Associates dialog: AI quality, anonymous group reviews, recent feedback. */
export default function AssociatesFeedback({ associate, evaluate }: { associate: AssociatePerformance; evaluate: () => Promise<void> }) {
  return (
    <div className="space-y-5">
      <QualityPanel associate={associate} evaluate={evaluate} />
      {associate.groupFeedback.visible ? <GroupReviewsPanel groupFeedback={associate.groupFeedback} /> : null}
      <RecentFeedbackPanel feedback={associate.feedback} />
    </div>
  );
}
