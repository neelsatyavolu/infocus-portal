"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FlaskConical, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { ApplicantReview } from "@/components/applications/applicant-review";
import { shortLabel } from "@/components/applications/my-picks";
import { EmptyState } from "@/components/kit/empty-state";
import { FilterChips } from "@/components/kit/filter-chips";
import { ListDetail } from "@/components/kit/layout";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { ordinal } from "@/src/lib/applications/desk";
import { formatPacific } from "@/src/lib/applications/format";
import { cn } from "@/src/lib/utils";
import type { ApplicationDetail, RoundOverview } from "@/src/server/applications/review";

type Row = RoundOverview["applications"][number];
type StatusFilter = "all" | "submitted" | "draft" | "mine";

/**
 * Applicants on the left, the selected application on the right. Phones show one pane at a time:
 * the list on the round's page, the application (with a back bar) once one is picked.
 */
export function ApplicantsWorkspace({
  overview,
  detail,
  showDetailOnPhone
}: {
  overview: RoundOverview;
  detail: ApplicationDetail | null;
  showDetailOnPhone: boolean;
}) {
  const router = useRouter();
  const base = `/applications/manage/${overview.round.id}`;

  return (
    <ListDetail
        listWidth="20rem"
        showDetailOnPhone={showDetailOnPhone}
        onBack={() => router.push(base as never)}
        backLabel="All applicants"
        list={<ApplicantList overview={overview} selectedId={detail?.application.id ?? null} />}
        detail={
          detail ? (
            <ApplicantReview key={detail.application.id} detail={detail} />
          ) : (
            <EmptyState size="page" icon={Users} title="No applicants yet" description="Applications show up here as students start them. Add mock applicants to try it out." />
          )
        }
      />
  );
}

function ApplicantList({ overview, selectedId }: { overview: RoundOverview; selectedId: string | null }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const { applications, decisions, voters, viewer } = overview;
  const counts = {
    all: applications.length,
    submitted: applications.filter((row) => row.status === "SUBMITTED").length,
    draft: applications.filter((row) => row.status === "DRAFT").length,
    mine: applications.filter((row) => row.status === "SUBMITTED" && !row.myVote).length
  };
  const rows = applications.filter((row) => {
    if (status === "submitted" && row.status !== "SUBMITTED") return false;
    if (status === "draft" && row.status !== "DRAFT") return false;
    if (status === "mine" && (row.status !== "SUBMITTED" || row.myVote)) return false;
    return true;
  });

  return (
    <nav aria-label="Applicants" className="space-y-3">
      <FilterChips
        ariaLabel="Show"
        size="sm"
        value={status}
        onChange={(value) => setStatus(value as StatusFilter)}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "submitted", label: "Submitted", count: counts.submitted },
          { value: "draft", label: "Drafts", count: counts.draft, hideWhenZero: true },
          ...(viewer.isVoter ? [{ value: "mine" as const, label: "No vote from me", count: counts.mine, hideWhenZero: true }] : [])
        ]}
      />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nobody matches.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {rows.map((row) => (
            <ApplicantRow
              key={row.id}
              row={row}
              href={`/applications/manage/${overview.round.id}/a/${row.id}`}
              active={row.id === selectedId}
              decisionLabel={decisions.find((decision) => decision.key === (row.decisionKey ?? row.tally.winner))?.label ?? null}
              voterCount={voters.length}
              pickLists={overview.pickLists}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}

function ApplicantRow({
  row,
  href,
  active,
  decisionLabel,
  voterCount,
  pickLists
}: {
  row: Row;
  href: string;
  active: boolean;
  decisionLabel: string | null;
  voterCount: number;
  pickLists: RoundOverview["pickLists"];
}) {
  const facts = [row.grade ? `Grade ${row.grade}` : null, row.submittedAt ? `Submitted ${formatPacific(row.submittedAt, false)}` : null].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={href as never}
        aria-current={active ? "page" : undefined}
        scroll={false}
        className={cn(
          "relative flex min-h-16 flex-col justify-center gap-1 px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active ? "bg-[var(--ink-3)]" : "hover:bg-[var(--ink-3)]"
        )}
      >
        {active ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-[var(--brand-green)]" /> : null}
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{row.name}</span>
          {row.isMock ? <StatusTag size="sm" tone="review">Mock</StatusTag> : null}
          {row.status === "DRAFT" ? <StatusTag size="sm" tone="warning">Draft</StatusTag> : null}
        </span>
        {facts ? <span className="truncate text-[12px] text-muted-foreground">{facts}</span> : null}
        {row.status === "SUBMITTED" ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            {row.picks ? (
              <span title="How many execs picked them">
                {pickLists.map((list) => `${shortLabel(list.label)} ${row.picks?.[list.key] ?? 0}`).join(" · ")}
              </span>
            ) : null}
            {row.ai ? <span title="AI read, reference only">AI {ordinal(row.ai.place)}/{row.ai.of}</span> : null}
            <span title="Votes cast">
              {row.tally.cast}/{voterCount} votes
            </span>
            {decisionLabel ? <StatusTag size="sm" tone="success">{decisionLabel}</StatusTag> : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** CSV, AI read for everyone and the mock controls, above both panes. */
export function RoundActions({ overview }: { overview: RoundOverview }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const { applications, viewer } = overview;
  const mockCount = applications.filter((row) => row.isMock).length;

  async function act(run: () => Promise<string>) {
    setBusy(true);
    try {
      toast.success(await run());
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** One request per application keeps each AI call inside the Worker's time limits. */
  async function runAiReads() {
    const targets = applications.filter((row) => row.status === "SUBMITTED" && !row.ai);
    if (!targets.length) {
      toast.message("Every submitted application already has an AI read.");
      return;
    }
    setBusy(true);
    let failed = 0;
    for (const [index, row] of targets.entries()) {
      setProgress(`Reading ${index + 1} of ${targets.length}…`);
      try {
        await send(`/api/applications/entries/${row.id}/ai-read`, "POST");
      } catch (error) {
        failed += 1;
        if (failed === 1) toast.error(`${row.name}: ${errorMessage(error)}`);
      }
    }
    setProgress(null);
    setBusy(false);
    toast.success(`AI read done for ${targets.length - failed} of ${targets.length}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {progress ? <StatusTag spinner>{progress}</StatusTag> : null}
      <a href={`/api/applications/rounds/${overview.round.id}/export`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Download aria-hidden />
        CSV
      </a>
      {viewer.canManage ? (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void runAiReads()} title="Reference-only scores for submitted applications without one">
            <Sparkles aria-hidden />
            Run AI read
          </Button>
          {mockCount ? (
            <Button
              size="sm"
              variant="destructive-quiet"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove ${mockCount} mock application${mockCount === 1 ? "" : "s"} (placeholders and exec test copies)?`))
                  void act(async () => `Removed ${(await send<{ removed: number }>(`/api/applications/rounds/${overview.round.id}/mock`, "DELETE")).removed} mock applications.`);
              }}
            >
              <Trash2 aria-hidden />
              Remove mocks
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act(async () => `Added ${(await send<{ added: number }>(`/api/applications/rounds/${overview.round.id}/mock`, "POST")).added} mock applicants.`)}
          >
            <FlaskConical aria-hidden />
            Add mock applicants
          </Button>
        </>
      ) : null}
    </div>
  );
}
