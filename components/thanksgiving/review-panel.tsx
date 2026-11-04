"use client";

import { useState } from "react";
import { toast } from "sonner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import type { ReviewRow } from "@/src/server/thanksgiving-review";

const REASON_LABELS: Record<string, string> = {
  automation: "automated browser",
  "inhuman-reaction": "too quick to react",
  "no-reaction-time": "no visitor",
  "too-fast": "clicks too close",
  "rate-limit": "over the rate limits",
  clock: "clock off",
  "outdated-page": "old page"
};

function rejectedSummary(rejected: Record<string, number>) {
  const parts = Object.entries(rejected)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${REASON_LABELS[reason] ?? reason}`);
  return parts.length > 0 ? parts.join(", ") : "None";
}

/**
 * Execs only, on /thanksgiving: who the cheat checks rejected catches from, who's flagged and why,
 * and a button to flag someone (off the board, can't win the contest) or clear them.
 */
export function ReviewPanel({ initialRows }: { initialRows: ReviewRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<string | null>(null);

  async function setFlag(row: ReviewRow, flagged: boolean) {
    setBusy(row.userId);
    try {
      const response = await fetch("/api/thanksgiving/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.userId, flagged })
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { data: { review: ReviewRow[] } };
      setRows(body.data.review);
      toast(flagged ? `${row.name} is off the board` : `${row.name} is back on the board`);
    } catch {
      toast.error(`Could not update ${row.name}. Please try again.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="harvest-review" className="space-y-3">
      <div>
        <h2 id="harvest-review" className="text-[18px] font-medium leading-snug tracking-[-0.015em] text-foreground">
          Cheat review
        </h2>
        <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-[var(--ink-text)]">
          Execs only. Catches no person could make never count. Accounts with too many of them, or with
          clicks spaced like a script, are flagged automatically: off the board and out of the contest
          until you clear them.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
              <th scope="col" className="px-3 py-2 font-medium">Rejected catches</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.userId}>
                <td className="max-w-[14rem] truncate px-3 py-2 font-medium text-foreground">{row.name}</td>
                <td className="px-3 py-2 text-right font-mono-broadcast tabular-nums text-foreground">{row.total}</td>
                <td className="px-3 py-2 text-[var(--ink-text)]">{rejectedSummary(row.rejected)}</td>
                <td className="px-3 py-2">
                  {row.flaggedAt ? (
                    <StatusTag tone="danger" size="sm" wrap title={row.flagReason ?? undefined}>
                      Flagged{row.flagReason ? `: ${row.flagReason}` : ""}
                    </StatusTag>
                  ) : row.botLike > 0 ? (
                    <StatusTag tone="warning" size="sm">Watch</StatusTag>
                  ) : (
                    <StatusTag tone="neutral" size="sm">OK</StatusTag>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant={row.flaggedAt ? "outline" : "destructive-quiet"}
                    disabled={busy !== null}
                    onClick={() => void setFlag(row, !row.flaggedAt)}
                  >
                    {row.flaggedAt ? "Clear" : "Flag"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
