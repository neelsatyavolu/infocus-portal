"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FlaskConical, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { DataTable, type DataColumn } from "@/components/kit/data-table";
import { FilterChips } from "@/components/kit/filter-chips";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ordinal } from "@/src/lib/applications/desk";
import { formatPacific } from "@/src/lib/applications/format";
import type { RoundOverview } from "@/src/server/applications/review";

type Row = RoundOverview["applications"][number];
type StatusFilter = "all" | "submitted" | "draft" | "mine";

/** Every applicant in a round, with rank, AI standing and votes at a glance. */
export function ApplicantsTable({ overview }: { overview: RoundOverview }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("submitted");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const { applications, decisions, voters, viewer } = overview;
  const decisionLabel = (key: string | null) => decisions.find((decision) => decision.key === key)?.label ?? null;

  const roles = useMemo(() => [...new Set(applications.map((row) => row.topRole).filter(Boolean))].sort(), [applications]);
  const rows = applications.filter((row) => {
    if (status === "submitted" && row.status !== "SUBMITTED") return false;
    if (status === "draft" && row.status !== "DRAFT") return false;
    if (status === "mine" && (row.status !== "SUBMITTED" || row.myVote)) return false;
    return !role || row.topRole === role;
  });
  const counts = {
    all: applications.length,
    submitted: applications.filter((row) => row.status === "SUBMITTED").length,
    draft: applications.filter((row) => row.status === "DRAFT").length,
    mine: applications.filter((row) => row.status === "SUBMITTED" && !row.myVote).length
  };
  const mockCount = applications.filter((row) => row.isMock).length;

  async function act(key: string, run: () => Promise<string>) {
    setBusy(key);
    try {
      toast.success(await run());
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  /** One request per application keeps each AI call inside the Worker's time limits. */
  async function runAiReads(all: boolean) {
    const targets = applications.filter((row) => row.status === "SUBMITTED" && (all || !row.ai));
    if (!targets.length) {
      toast.message("Every submitted application already has an AI read.");
      return;
    }
    setBusy("ai");
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
    setBusy(null);
    toast.success(`AI read done for ${targets.length - failed} of ${targets.length}.`);
    router.refresh();
  }

  const columns: DataColumn<Row>[] = [
    {
      key: "name",
      header: "Applicant",
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.isMock ? <StatusTag size="sm" tone="review">Mock</StatusTag> : null}
          {row.extensionUntil ? <StatusTag size="sm" tone="info">Extension</StatusTag> : null}
        </span>
      )
    },
    {
      key: "status",
      header: "Status",
      render: (row) =>
        row.status === "SUBMITTED" ? (
          <span className="text-[13px] text-muted-foreground">{row.submittedAt ? formatPacific(row.submittedAt) : "Submitted"}</span>
        ) : (
          <StatusTag size="sm" tone="warning">Draft</StatusTag>
        )
    },
    { key: "grade", header: "Grade", mono: true, align: "end", width: "5rem", hideBelow: "md", render: (row) => row.grade || "–" },
    { key: "role", header: "Top choice", hideBelow: "lg", render: (row) => row.topRole || "–" },
    {
      key: "rank",
      header: "Avg rank",
      mono: true,
      align: "end",
      width: "7rem",
      headerTitle: "Average of every submitted ranking (hidden until you submit yours)",
      render: (row) => (row.averageRank != null ? `${row.averageRank.toFixed(1)} (${row.rankCount})` : "–")
    },
    {
      key: "ai",
      header: "AI read",
      mono: true,
      align: "end",
      width: "7rem",
      hideBelow: "md",
      headerTitle: "Reference only: place among AI-read applicants",
      render: (row) => (row.ai ? <span className="text-muted-foreground">{`${ordinal(row.ai.place)} of ${row.ai.of}`}</span> : "–")
    },
    {
      key: "votes",
      header: "Decision",
      render: (row) => {
        if (row.status !== "SUBMITTED") return "–";
        const winner = decisionLabel(row.decisionKey ?? row.tally.winner);
        return (
          <span className="flex flex-wrap items-center gap-2">
            {winner ? <StatusTag size="sm" tone="success">{winner}</StatusTag> : <span className="text-[13px] text-muted-foreground">{row.tally.cast ? "Split" : "No votes"}</span>}
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {row.tally.cast}/{voters.length}
            </span>
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            ariaLabel="Show"
            value={status}
            onChange={(value) => setStatus(value as StatusFilter)}
            options={[
              { value: "submitted", label: "Submitted", count: counts.submitted },
              { value: "draft", label: "Drafts", count: counts.draft },
              ...(viewer.isVoter ? [{ value: "mine" as const, label: "No vote from me", count: counts.mine }] : []),
              { value: "all", label: "All", count: counts.all }
            ]}
          />
          {roles.length > 1 ? (
            <NativeSelect aria-label="Top choice" value={role} onChange={(e) => setRole(e.target.value)} placeholderOption="Any top choice" wrapperClassName="w-48">
              {roles.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {progress ? <StatusTag spinner>{progress}</StatusTag> : null}
          <a href={`/api/applications/rounds/${overview.round.id}/export`} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden />
            CSV
          </a>
          {viewer.canManage ? (
            <>
              <Button variant="outline" disabled={busy !== null} onClick={() => void runAiReads(false)} title="Reference-only scores for submitted applications without one">
                <Sparkles aria-hidden />
                Run AI read
              </Button>
              {mockCount ? (
                <Button
                  variant="destructive-quiet"
                  disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Remove ${mockCount} mock application${mockCount === 1 ? "" : "s"} (placeholders and exec test copies)?`))
                      void act("mock", async () => `Removed ${(await send<{ removed: number }>(`/api/applications/rounds/${overview.round.id}/mock`, "DELETE")).removed} mock applications.`);
                  }}
                >
                  <Trash2 aria-hidden />
                  Remove mocks
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void act("mock", async () => `Added ${(await send<{ added: number }>(`/api/applications/rounds/${overview.round.id}/mock`, "POST")).added} mock applicants.`)
                }
              >
                <FlaskConical aria-hidden />
                Add mock applicants
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/applications/manage/${overview.round.id}/a/${row.id}`}
        empty={status === "submitted" ? "No submitted applications yet." : "Nothing here."}
      />
    </div>
  );
}
