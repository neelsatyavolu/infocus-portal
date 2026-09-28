"use client";

import { useEffect, useState } from "react";
import { Award, Download } from "lucide-react";
import { certificateHref } from "@/components/package-cycle/package-of-cycle-card";
import type { PackageOfCycleWinner } from "@/src/server/package-of-cycle";

type WinnersResponse = {
  viewerUserId: string;
  canDownloadAll: boolean;
  winners: PackageOfCycleWinner[];
};

/** Package of the Cycle winners, newest cycle first. Renders nothing until someone wins. */
export function PackageOfCycleWinners() {
  const [data, setData] = useState<WinnersResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/package-cycle/package-of-cycle", { cache: "no-store" });
        const body = (await response.json()) as { data?: WinnersResponse };
        if (!cancelled && response.ok && body.data) setData(body.data);
      } catch {
        // Package Cycles still works without the winners strip.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || data.winners.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Package of the Cycle">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-[var(--brand-green)]" />
        <h2 className="text-sm font-semibold text-foreground">Package of the Cycle</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.winners.map((winner) => (
          <article key={winner.rowId} className="rounded-xl border border-[var(--brand-green)]/50 bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Cycle {winner.cycleNumber}
            </div>
            <p className="mt-1 text-base font-semibold text-foreground">
              {winner.headline ?? (winner.topic || "Untitled package")}
            </p>
            {winner.headline && winner.topic ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{winner.topic}</p>
            ) : null}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {winner.members.map((member) =>
                data.canDownloadAll || member.userId === data.viewerUserId ? (
                  <li key={member.userId}>
                    <a
                      href={certificateHref(winner.rowId, member.userId)}
                      className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-[var(--brand-green)]"
                      title={`Download ${member.name}'s certificate`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {member.name}
                    </a>
                  </li>
                ) : (
                  <li key={member.userId} className="text-sm text-foreground">
                    {member.name}
                  </li>
                )
              )}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
