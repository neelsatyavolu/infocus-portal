"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { MyRanking } from "@/components/applications/my-ranking";
import { Alert } from "@/components/kit/alert";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ordinal } from "@/src/lib/applications/desk";
import { formatPacific, pacificInputToIso } from "@/src/lib/applications/format";
import { cn } from "@/src/lib/utils";
import type { RoundOverview } from "@/src/server/applications/review";

/** Ranking, the shared board, majority votes and release, for one round. */
export function DecisionDesk({ overview }: { overview: RoundOverview }) {
  const submitted = overview.applications.filter((row) => row.status === "SUBMITTED");
  const { viewer, myRanking } = overview;

  return (
    <div className="space-y-5">
      {viewer.canManage ? (
        <MyRanking
          key={myRanking?.submittedAt ?? "draft"}
          roundId={overview.round.id}
          applicants={submitted.map((row) => ({ id: row.id, name: row.name, isMock: row.isMock, ai: row.ai }))}
          initialOrder={myRanking?.order ?? submitted.map((row) => row.id)}
          initialReasons={myRanking?.reasons ?? {}}
          submittedAt={myRanking?.submittedAt ?? null}
        />
      ) : (
        <Alert tone="info" title="View only">
          Advisers can see every ranking and vote, but only executive producers and the super admin rank and vote.
        </Alert>
      )}
      <Board overview={overview} />
      {viewer.canManage ? <ReleasePanel overview={overview} /> : null}
    </div>
  );
}

function Board({ overview }: { overview: RoundOverview }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const { decisions, voters, rankers, viewer, seesOthers } = overview;
  const locked = Boolean(overview.round.releaseAt);
  const rows = overview.applications
    .filter((row) => row.status === "SUBMITTED")
    .sort((a, b) => (a.averageRank ?? Infinity) - (b.averageRank ?? Infinity) || a.name.localeCompare(b.name));

  async function vote(applicationId: string, optionKey: string | null) {
    setPending(applicationId);
    try {
      await send(`/api/applications/entries/${applicationId}/vote`, "PUT", { optionKey });
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <Panel
      title="Board"
      padding="none"
      description={
        seesOthers
          ? `Every submitted ranking, the average, the AI read (reference only) and the final vote. A decision needs ${Math.floor(Math.max(voters.length, 1) / 2) + 1} of ${voters.length} votes.`
          : "Submit your ranking to see everyone else's. Votes are open now."
      }
      status={locked ? <StatusTag tone="info">Votes locked for release</StatusTag> : null}
    >
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground md:px-5">No submitted applications yet.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((row) => {
            const winner = decisions.find((decision) => decision.key === (row.decisionKey ?? row.tally.winner));
            return (
              <li key={row.id} className="space-y-3 px-4 py-3 md:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Link href={`/applications/manage/${overview.round.id}/a/${row.id}` as never} className="text-sm font-semibold hover:underline">
                    {row.name}
                  </Link>
                  {row.isMock ? <StatusTag size="sm" tone="review">Mock</StatusTag> : null}
                  <span className="font-mono text-[13px] tabular-nums">avg {row.averageRank != null ? row.averageRank.toFixed(1) : "–"}</span>
                  {row.ai ? (
                    <span className="font-mono text-[12px] tabular-nums text-muted-foreground" title="AI read, reference only">
                      AI {ordinal(row.ai.place)} of {row.ai.of}
                    </span>
                  ) : null}
                  {winner ? <StatusTag tone="success">{winner.label}</StatusTag> : row.tally.cast ? <StatusTag tone="warning">Split</StatusTag> : null}
                </div>
                {seesOthers && rankers.length ? (
                  <div className="flex flex-wrap gap-2">
                    {rankers.map((ranker) => {
                      const place = ranker.order.indexOf(row.id) + 1;
                      const reason = ranker.reasons[row.id];
                      return (
                        <span key={ranker.reviewerId} className="inline-flex max-w-full items-baseline gap-1.5 rounded border border-border px-2 py-1 text-[12px]" title={reason || undefined}>
                          <span className="text-muted-foreground">{ranker.name.split(" ")[0]}</span>
                          <span className="font-mono tabular-nums">{place > 0 ? `#${place}` : "–"}</span>
                          {reason ? <span className="truncate text-muted-foreground">· {reason}</span> : null}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {decisions.map((decision) => {
                    const count = row.tally.counts[decision.key] ?? 0;
                    const mine = row.myVote === decision.key;
                    return viewer.isVoter ? (
                      <Button
                        key={decision.key}
                        size="sm"
                        variant={mine ? "default" : "outline"}
                        aria-pressed={mine}
                        disabled={locked || pending === row.id}
                        onClick={() => void vote(row.id, mine ? null : decision.key)}
                      >
                        {decision.label}
                        <span className="font-mono tabular-nums opacity-80">{count}</span>
                      </Button>
                    ) : (
                      <span key={decision.key} className={cn("rounded border border-border px-2 py-1 text-[12px]", count && "text-foreground")}>
                        {decision.label} <span className="font-mono tabular-nums">{count}</span>
                      </span>
                    );
                  })}
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                    {row.tally.cast}/{voters.length} voted
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ReleasePanel({ overview }: { overview: RoundOverview }) {
  const router = useRouter();
  const [when, setWhen] = useState("2027-03-24T20:00");
  const [busy, setBusy] = useState(false);
  const { round } = overview;
  const undecided = overview.applications.filter((row) => row.status === "SUBMITTED" && !row.isMock && !row.tally.winner).length;

  async function setRelease(releaseAt: string | null, message: string) {
    setBusy(true);
    try {
      await send(`/api/applications/rounds/${round.id}/release`, "PUT", { releaseAt });
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Release decisions"
      description="Releasing freezes each applicant's majority decision and locks votes. Each applicant sees only their own result, on this site."
      status={
        round.released ? (
          <StatusTag tone="success">Released</StatusTag>
        ) : round.releaseAt ? (
          <StatusTag tone="info">Scheduled {formatPacific(round.releaseAt)}</StatusTag>
        ) : undecided ? (
          <StatusTag tone="warning">{undecided} without a majority</StatusTag>
        ) : (
          <StatusTag tone="success">Ready</StatusTag>
        )
      }
    >
      {round.releaseAt ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            {round.released ? "Applicants can see their decisions." : `Applicants see their decisions from ${formatPacific(round.releaseAt)}.`}
          </p>
          <Button
            variant="destructive-quiet"
            disabled={busy}
            onClick={() => {
              if (window.confirm(round.released ? "Hide decisions from applicants again and unlock votes?" : "Cancel the scheduled release and unlock votes?"))
                void setRelease(null, "Release cancelled. Votes are unlocked.");
            }}
          >
            {round.released ? "Un-release" : "Cancel release"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            Release at (Pacific)
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-56 normal-case tracking-normal" />
          </label>
          <Button variant="outline" disabled={busy || !when} onClick={() => void setRelease(pacificInputToIso(when), "Release scheduled.")}>
            Schedule release
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (window.confirm("Release decisions to applicants now?")) void setRelease(new Date().toISOString(), "Decisions released.");
            }}
          >
            Release now
          </Button>
        </div>
      )}
    </Panel>
  );
}
