"use client";

import { useState } from "react";
import { Award, Check, Download } from "lucide-react";
import { toast } from "sonner";
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

/** Executive producers vote here, beside grading. Unanimous = Package of the Cycle. */
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
    <section
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4",
        awarded ? "border-[var(--brand-green)]/50" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className={cn("h-4 w-4", awarded ? "text-[var(--brand-green)]" : "text-muted-foreground")} />
          <h3 className="text-sm font-semibold text-foreground">Package of the Cycle</h3>
        </div>
        <span className={cn("status-pill status-pill-sm shrink-0", awarded ? "status-approved" : "status-neutral")}>
          {awarded ? "Awarded" : `${votes}/${panel.graders.length} votes`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Every executive producer has to vote for it. Up to {PACKAGE_OF_CYCLE_MAX} packages win each cycle.
      </p>

      {panel.graders.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {panel.graders.map((grader) => (
            <li
              key={grader.userId}
              className={cn("status-pill status-pill-sm", grader.voted ? "status-approved" : "status-neutral")}
            >
              {grader.voted ? <Check className="mr-1 h-3 w-3" /> : null}
              {grader.name}
            </li>
          ))}
        </ul>
      ) : null}

      {panel.canVote ? (
        <div className="space-y-1.5">
          <Button
            type="button"
            size="sm"
            variant={panel.myVote ? "secondary" : "default"}
            disabled={saving || voteBlocked}
            onClick={() => void vote(!panel.myVote)}
          >
            {panel.myVote ? "Withdraw my vote" : "Vote for Package of the Cycle"}
          </Button>
          {voteBlocked ? <p className="text-xs text-muted-foreground">{panel.blockedReason}</p> : null}
        </div>
      ) : null}

      {awarded && members.length > 0 ? (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Certificates
          </div>
          <ul className="space-y-1">
            {members.map((member) => (
              <li key={member.userId}>
                <a
                  href={certificateHref(rowId, member.userId)}
                  className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-[var(--brand-green)]"
                >
                  <Download className="h-3.5 w-3.5" />
                  {member.name || member.email || "Member"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Shown to the group on its Final Cut page once the package wins. */
export function PackageOfCycleBanner({ rowId }: { rowId: string }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--brand-green)]/50 bg-card p-4">
      <div className="flex items-start gap-3">
        <Award className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-green)]" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Package of the Cycle</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The executive producers chose your package as one of the best this cycle.
          </p>
        </div>
      </div>
      <a href={certificateHref(rowId)} className={buttonVariants({ size: "sm" })}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Download certificate
      </a>
    </section>
  );
}
