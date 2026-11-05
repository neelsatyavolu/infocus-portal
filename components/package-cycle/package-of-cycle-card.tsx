"use client";

import { useState } from "react";
import { Award, Check, Download } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { Panel } from "@/components/kit/panel";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { PACKAGE_OF_CYCLE_MAX } from "@/src/lib/package-of-cycle";
import { cn } from "@/src/lib/utils";

export type PackageOfCyclePanelData = {
  canVote: boolean;
  myVote: boolean;
  awardedAt: string | null;
  blockedReason: string | null;
  graders: Array<{ userId: string; name: string; voted: boolean }>;
};

export function certificateHref(rowId: string, memberId?: string) {
  const query = new URLSearchParams({ rowId });
  if (memberId) query.set("memberId", memberId);
  return `/api/package-cycle/package-of-cycle/certificate?${query}`;
}

/**
 * Executive producers vote here, beside grading. Unanimous = Package of the Cycle.
 * Withdraw my vote is a reversible state change, so it stays an outline button (not destructive).
 */
export function PackageOfCycleCard({
  rowId,
  panel,
  members,
  onChanged
}: {
  rowId: string;
  panel: PackageOfCyclePanelData;
  members: Array<{ userId: string; name: string | null; email: string | null }>;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const votes = panel.graders.filter((grader) => grader.voted).length;
  const awarded = Boolean(panel.awardedAt);
  // A blocked reason only stops new votes; withdrawing is always allowed.
  const voteBlocked = !panel.myVote && Boolean(panel.blockedReason);

  async function vote(next: boolean) {
    setSaving(true);
    try {
      const response = await fetch("/api/package-cycle/package-of-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, vote: next })
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: PackageOfCyclePanelData;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        toast.error(body.error?.message ?? "Could not save your vote.");
        return;
      }
      toast.success(
        body.data.awardedAt && !panel.awardedAt
          ? "Package of the Cycle awarded."
          : next
            ? "Vote saved."
            : "Vote withdrawn."
      );
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Award
            aria-hidden
            className={cn("h-4 w-4", awarded ? "text-[var(--brand-green)]" : "text-muted-foreground")}
          />
          Package of the Cycle
        </span>
      }
      titleAs="h2"
      status={
        <StatusTag tone={awarded ? "success" : "neutral"}>
          {awarded ? "Awarded" : `${votes}/${panel.graders.length} votes`}
        </StatusTag>
      }
      description={`Every executive producer has to vote for it. Up to ${PACKAGE_OF_CYCLE_MAX} packages win each cycle.`}
      padding="md"
      tone={awarded ? "brand" : "default"}
      bodyClassName="space-y-3"
    >
      {panel.graders.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Votes">
          {panel.graders.map((grader) => (
            <li key={grader.userId} className="min-w-0">
              <StatusTag tone={grader.voted ? "success" : "neutral"} icon={grader.voted ? Check : undefined}>
                {grader.name}
              </StatusTag>
            </li>
          ))}
        </ul>
      ) : null}

      {panel.canVote ? (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            className="w-full max-sm:h-10"
            disabled={saving || voteBlocked}
            onClick={() => void vote(!panel.myVote)}
          >
            {saving ? <Spinner /> : null}
            {panel.myVote ? "Withdraw my vote" : "Vote for Package of the Cycle"}
          </Button>
          {voteBlocked ? <p className="text-[13px] text-muted-foreground">{panel.blockedReason}</p> : null}
        </div>
      ) : null}

      {awarded && members.length > 0 ? (
        <div className="space-y-1.5 border-t border-border pt-3">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Certificates</h3>
          <ul className="space-y-0.5">
            {members.map((member) => (
              <li key={member.userId}>
                <a
                  href={certificateHref(rowId, member.userId)}
                  className="inline-flex min-h-8 items-center gap-2 text-sm text-foreground transition-colors hover:text-[var(--brand-green)] max-sm:min-h-10"
                >
                  <Download aria-hidden className="h-4 w-4 shrink-0" />
                  {member.name || member.email || "Member"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

/** Shown to the group on its Final Cut page once the package wins. */
export function PackageOfCycleBanner({ rowId }: { rowId: string }) {
  return (
    <Alert
      tone="success"
      icon={Award}
      title="Package of the Cycle"
      action={
        <a href={certificateHref(rowId)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-sm:h-10")}>
          <Download aria-hidden />
          Download certificate
        </a>
      }
    >
      The executive producers chose your package as one of the best this cycle.
    </Alert>
  );
}
