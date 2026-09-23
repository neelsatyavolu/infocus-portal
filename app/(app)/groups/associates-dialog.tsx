"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3, MessageSquareText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ASSOCIATE_STAGE_LABELS, type AssociatesPayload, type AssociatePerformance } from "@/src/lib/associate-performance";
import AssociatesFeedback from "./associates-feedback";
import { cn } from "@/src/lib/utils";

function duration(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`;
  return hours < 48 ? `${Math.round(hours * 10) / 10}h` : `${Math.round(hours / 24 * 10) / 10}d`;
}

function groupHref(rowId: string, stage: string) {
  return `/groups/${rowId}/${stage === "initial-cut" ? "initial-stage-1" : stage}`;
}

export default function AssociatesDialog({ cycles, activeCycleNumber }: {
  cycles: Array<{ cycleNumber: number; focus: string }>;
  activeCycleNumber: number;
}) {
  const [tab, setTab] = useState<"overview" | "feedback">("overview");
  const [open, setOpen] = useState(false);
  const [cycle, setCycle] = useState(activeCycleNumber);
  const [data, setData] = useState<AssociatesPayload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setData(null);
    setError(null);
    async function load() {
      try {
        const response = await fetch(`/api/groups/associates?cycle=${cycle}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { data?: AssociatesPayload; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to load associates.");
        if (!controller.signal.aborted) setData(payload.data);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load associates.");
      }
    }
    void load();
    return () => controller.abort();
  }, [open, cycle, retry]);

  const associate = data?.associates.find((a) => a.userId === selected) ?? data?.associates[0];
  const metrics = associate?.metrics;
  async function evaluateQuality() {
    if (!associate) return;
    const response = await fetch("/api/groups/associates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle, userId: associate.userId })
    });
    const payload = await response.json() as { data?: { associate: AssociatePerformance }; error?: { message?: string } };
    if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to evaluate feedback.");
    const updated = payload.data.associate;
    setData((previous) => previous?.cycleNumber === cycle ? { ...previous, associates: previous.associates.map((a) => a.userId === updated.userId ? updated : a) } : previous);
  }
  return (
    <Dialog open={open} onOpenChange={(value) => { if (value) setCycle(activeCycleNumber); setOpen(value); }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary"><Users className="mr-2 h-4 w-4" />Associates</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:rounded-2xl sm:p-0">
        <div className="border-b border-border bg-muted/20 px-5 py-5 sm:px-7">
          <DialogHeader className="pr-8 text-left">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-green)]">Producer team</p>
            <DialogTitle className="text-2xl">Associates</DialogTitle>
            <DialogDescription>Review habits, workload, and feedback — one cycle at a time.</DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-3 text-xs text-muted-foreground">
              Package cycle
              <select aria-label="Associate performance cycle" value={cycle} onChange={(e) => setCycle(Number(e.target.value))}
                className="h-9 max-w-60 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {cycles.map((c) => <option key={c.cycleNumber} value={c.cycleNumber}>Cycle {c.cycleNumber}{c.focus ? ` · ${c.focus}` : ""}</option>)}
              </select>
            </label>
            <span className="text-xs text-muted-foreground">Visible to executives & adviser</span>
          </div>
        </div>
        <div className="max-h-[65dvh] min-h-0 overflow-y-auto">
          {error ? <div role="alert" className="space-y-3 p-8 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>Try again</Button></div>
            : !data ? <div role="status" className="space-y-4 p-7"><p className="text-sm text-muted-foreground">Loading associate performance…</p><div className="h-48 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" /></div>
            : !associate || !metrics ? <p className="p-10 text-center text-sm text-muted-foreground">No associate producers are registered yet.</p>
            : <div className="grid md:grid-cols-[235px_minmax(0,1fr)]">
              <nav aria-label="Associates" className="border-b border-border bg-muted/10 p-3 md:border-b-0 md:border-r">
                <p className="px-3 pb-3 pt-1 text-[10px] uppercase tracking-widest text-muted-foreground">Team · {data.associates.length}</p>
                <div className="flex gap-2 overflow-x-auto md:block md:space-y-1">
                  {data.associates.map((a) => <button key={a.userId} type="button" onClick={() => setSelected(a.userId)} aria-pressed={a.userId === associate.userId}
                    className={cn("flex min-w-44 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-full", a.userId === associate.userId ? "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/10" : "border-transparent hover:bg-muted/50")}>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{a.name}</span><span className="text-[11px] text-muted-foreground">{a.assignedGroups} assigned {a.assignedGroups === 1 ? "group" : "groups"}</span></span>
                    <span className="text-lg font-semibold tabular-nums">{a.metrics.score ?? "—"}</span>
                  </button>)}
                </div>
              </nav>
              <div className="min-w-0 space-y-6 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div><h3 className="text-xl font-semibold tracking-tight">{associate.name}</h3><p className="mt-1 text-xs text-muted-foreground">{metrics.eligible} eligible stage {metrics.eligible === 1 ? "review" : "reviews"} · {associate.assignedGroups} assigned groups</p></div>
                  <div className="shrink-0 rounded-2xl border border-[var(--brand-green)]/25 bg-[var(--brand-green)]/5 px-5 py-3 text-center">
                    <div className="text-3xl font-semibold tabular-nums text-[var(--brand-green)]">{metrics.score ?? "—"}<span className="ml-1 text-xs font-normal text-muted-foreground">/100</span></div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{metrics.score === null ? "Not enough data" : metrics.provisional ? "Provisional score" : "Overall score"}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border">
                  <div className="flex gap-4" aria-label="Associate detail views">{(["overview", "feedback"] as const).map((value) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={cn("border-b-2 px-1 pb-3 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === value ? "border-[var(--brand-green)] text-foreground" : "border-transparent text-muted-foreground")}>{value}</button>)}</div>
                  <span className="pb-3 text-[10px] text-muted-foreground">{metrics.availableWeight}% of score weight available</span>
                </div>
                {tab === "feedback" ? <AssociatesFeedback key={`${cycle}:${associate.userId}`} associate={associate} evaluate={evaluateQuality} /> : <div className="space-y-6">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Median response", value: duration(metrics.medianHours), icon: Clock3 },
                    { label: "Verified reviews", value: metrics.reviewed === 0 && metrics.unknown > 0 ? "—" : String(metrics.reviewed), icon: MessageSquareText },
                    { label: "Known awaiting review", value: metrics.pending === 0 && metrics.unknown > 0 ? "—" : String(metrics.pending), icon: Users }
                  ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-border px-3 py-3"><Icon className="mb-3 h-4 w-4 text-muted-foreground" /><p className="text-xl font-medium tabular-nums">{value}</p><p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{label}</p></div>)}
                </div>
                {(metrics.unknown > 0 || metrics.missingTiming > 0) && <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{metrics.reviewed} verified reviews. {metrics.missingTiming} lack submission timing; {metrics.unknown} other stages lack review history. Missing records do not mean no work was done.</p>}
                {metrics.overdue > 0 && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{metrics.overdue} stage {metrics.overdue === 1 ? "review has" : "reviews have"} waited at least 48 hours.</p>}
                <section aria-label="Score breakdown" className="space-y-3">
                  {[
                    { label: "AI feedback quality", weight: 25, value: associate.quality.score, detail: "Specific, actionable, reasoned, constructive feedback" },
                    { label: "Group progress", weight: 25, value: associate.progress.score, detail: "Completed milestones that are due, averaged across groups" },
                    { label: "Responsiveness", weight: 25, value: metrics.responsiveness, detail: "First response within 48 hours" },
                    { label: "Review coverage", weight: 10, value: metrics.reviewCoverage, detail: "Submitted stages with an attributed response" },
                    { label: "Group feedback", weight: 10, value: associate.groupFeedback.score, detail: "Anonymous group ratings of helpfulness, communication and support" },
                    { label: "Feedback coverage", weight: 5, value: metrics.feedbackCoverage, detail: "Eligible groups with written feedback" }
                  ].map((item) => <div key={item.label}>
                    <div className="mb-1.5 flex justify-between gap-3 text-xs"><span>{item.label} <span className="ml-1 text-muted-foreground">{item.weight}% weight</span></span><span className="tabular-nums">{item.value === null ? "—" : `${Math.round(item.value)}%`}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--brand-green)]/70" style={{ width: `${item.value ?? 0}%` }} /></div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p>
                  </div>)}
                </section>
                <details className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">How this score works</summary>
                  <p className="mt-3 leading-relaxed">The first response to brainstorming, A-roll/B-roll, and initial cut v1 counts once per group and stage. A response is a comment, submitted review, or approval by this associate. Unanswered work has a 48-hour grace period. Hours include nights and weekends.</p>
                  <p className="mt-2 leading-relaxed">The score combines the six components above. Missing components are excluded and the available weights are rescaled to 100; the result is labeled provisional. No feedback on eligible reviews gives quality zero; no eligible work is unscored. More comments do not earn extra points. Current assignments determine the groups shown; past reassignments are not reconstructed.</p>
                  <p className="mt-2 leading-relaxed">Older upload times are estimates. Approvals without attribution are excluded. Verified comments and approvals still count toward coverage when submission timing is missing; only response speed is unavailable. Missing timing is excluded from responsiveness. {metrics.unknown} {metrics.unknown === 1 ? "stage has" : "stages have"} incomplete history.</p>
                </details>
                <section>
                  <h4 className="mb-3 text-sm font-medium">Review evidence</h4>
                  {!associate.samples.length ? <p className="text-xs text-muted-foreground">No reviewable work in this cycle yet.</p> : <div className="divide-y divide-border">
                    {associate.samples.map((s) => <div key={`${s.rowId}:${s.stage}`} className="flex items-center justify-between gap-3 py-3 text-xs">
                      <div className="min-w-0"><Link href={groupHref(s.rowId, s.stage) as never} className="inline-flex max-w-full items-center gap-1 font-medium hover:underline"><span className="truncate">{s.topic}</span><ArrowUpRight className="h-3 w-3 shrink-0" /></Link><p className="mt-1 text-[11px] text-muted-foreground">{ASSOCIATE_STAGE_LABELS[s.stage]}{s.estimated ? " · estimated timing" : ""}</p></div>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{s.respondedAt && !s.submittedAt ? "Reviewed · timing unknown" : s.historicalUnknown ? "Reviewer unknown" : s.respondedAt && s.submittedAt ? duration((Date.parse(s.respondedAt) - Date.parse(s.submittedAt)) / 3_600_000) : "Awaiting review"}</span>
                    </div>)}
                  </div>}
                </section>
                <section>
                  <h4 className="mb-3 text-sm font-medium">Group progress</h4>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Current milestone completion, not proof of individual impact. Future and undated milestones are excluded. Approved extensions move the final-cut deadline. Student effort and later reviewer decisions also affect progress.</p>
                  <div className="space-y-3">{associate.progress.groups.map((group) => <div key={group.rowId} className="rounded-xl border border-border p-3"><div className="flex justify-between gap-3 text-sm"><span>{group.topic}</span><span className="tabular-nums">{group.completed}/{group.due} due milestones</span></div><div className="mt-2 flex flex-wrap gap-2">{group.milestones.map((m) => <span key={m.label} className={cn("rounded-md px-2 py-1 text-[10px]", m.complete ? "bg-emerald-500/10 text-emerald-300" : m.dueAt && Date.parse(m.dueAt) <= Date.now() ? "bg-amber-500/10 text-amber-300" : "bg-muted text-muted-foreground")}>{m.label} · {m.complete ? "Complete" : !m.dueAt ? "Unscheduled" : Date.parse(m.dueAt) > Date.now() ? "Not due" : "Pending"}</span>)}</div></div>)}</div>
                </section>
                </div>}
              </div>
            </div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
