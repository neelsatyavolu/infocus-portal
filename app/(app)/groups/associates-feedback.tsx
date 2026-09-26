"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QUALITY_DIMENSIONS } from "@/src/lib/associate-feedback-quality";
import type { AssociatePerformance } from "@/src/lib/associate-performance";

export default function AssociatesFeedback({ associate, evaluate }: { associate: AssociatePerformance; evaluate: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quality = associate.quality;
  async function run() {
    setBusy(true); setError(null);
    try { await evaluate(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to score feedback."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-7">
    <section className="rounded-xl border border-[var(--brand-green)]/25 bg-[var(--brand-green)]/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h4 className="text-sm font-semibold">Feedback quality <span className="font-normal text-muted-foreground">· AI assessment</span></h4><p className="mt-1 text-2xl font-semibold tabular-nums">{quality.score ?? "—"}<span className="text-xs font-normal text-muted-foreground"> /100 · 25% of overall</span></p></div>
        {quality.status !== "ready" && quality.status !== "no_feedback" && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run()}>{busy ? "Evaluating…" : quality.status === "pending" ? "Check evaluation" : quality.status === "unavailable" ? "Try again" : "Score feedback"}</Button>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground" role="status">{busy ? "Applying the same rubric to the anonymized feedback sample…" : quality.message}</p>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      {quality.dimensions && <div className="mt-4 grid grid-cols-2 gap-3">{Object.entries(QUALITY_DIMENSIONS).map(([key, weight]) => <div key={key} className="text-xs"><span className="capitalize">{key}</span> <span className="text-muted-foreground">{weight}% of quality</span><p className="mt-1 font-medium tabular-nums">{quality.dimensions![key as keyof typeof QUALITY_DIMENSIONS]}/100</p></div>)}</div>}
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{quality.sampledNotes} of {quality.totalNotes} notes sampled across groups and stages. Names and links are removed before scoring. This evaluates written usefulness, not the correctness of advice about unseen footage. Model assessments can be wrong; inspect the evidence below.</p>
      <p className="mt-2 text-[10px] text-muted-foreground">{quality.model} · {quality.rubric}{quality.evaluatedAt ? ` · ${new Date(quality.evaluatedAt).toLocaleString()}` : ""}. Automatically refreshed daily starting at midnight Pacific, with 30 minutes between producers. Saved results remain visible between refreshes.</p>
      {quality.items.length > 0 && <details className="mt-4 text-xs"><summary className="cursor-pointer font-medium">Assessment evidence</summary><div className="mt-3 space-y-3">{quality.items.map((item) => <article key={item.ref} className="rounded-lg border border-border bg-background/60 p-3"><div className="flex justify-between gap-3"><span>{associate.feedback.find((n) => n.id === item.noteId)?.topic ?? "Group feedback"} · {item.stage}</span><span className="font-semibold">{item.score}/100</span></div><blockquote className="mt-2 border-l-2 border-border pl-2 text-muted-foreground">“{item.quote}”</blockquote><p className="mt-2 leading-relaxed">{item.reason}</p></article>)}</div></details>}
    </section>
    {associate.groupFeedback.visible && <section>
      <div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">Anonymous group reviews</h4><span className="text-xs text-muted-foreground">{associate.groupFeedback.score ?? "—"}/100 · 10% weight</span></div>
      <p className="mb-3 text-xs text-muted-foreground">Only executive producers can read these. The group is identified; the submitting member is not recorded. Each group counts once.</p>
      {!associate.groupFeedback.reviews.length ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">No group reviews for this cycle yet. Missing reviews do not reduce the score.</p> : <div className="space-y-3">{associate.groupFeedback.reviews.map((review) => <article key={review.rowId} className="rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><h5 className="text-sm font-medium">{review.groupTopic}</h5><time className="text-[10px] text-muted-foreground" dateTime={review.updatedAt}>{new Date(review.updatedAt).toLocaleDateString()}</time></div><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span>Helpful {review.helpfulness}/5</span><span>Communication {review.communication}/5</span><span>Support {review.support}/5</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{review.body}</p></article>)}</div>}
    </section>}
    <section><h4 className="mb-3 text-sm font-semibold">Producer’s recent feedback <span className="font-normal text-muted-foreground">· latest 20</span></h4>
      {!associate.feedback.length ? <p className="text-xs text-muted-foreground">No written feedback recorded for these stages.</p> : <div className="space-y-3">{associate.feedback.map((note) => <article key={note.id} className="rounded-xl border border-border bg-muted/15 p-4"><div className="flex flex-wrap justify-between gap-2 text-[10px] text-muted-foreground"><Link className="hover:text-foreground" href={`/groups/${note.rowId}/${note.stage === "initial-cut" ? "initial-stage-1" : note.stage}` as never}>{note.topic} · {note.stage}</Link><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString()}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{note.body}</p></article>)}</div>}
    </section>
  </div>;
}
