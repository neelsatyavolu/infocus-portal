"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

export type FinalCutGradeCardData = {
  canGrade: boolean;
  complete: boolean;
  average: number | null;
  officialPoints: number | null;
  pendingCount: number;
  myPoints: number | null;
  viewerUserId: string;
  deadlineAt: string | null;
  turnedInAt: string | null;
  extensionDays: number;
  daysLate: number;
  penaltyMultiplier: number;
  blocksSecondRevision: boolean;
  revisionCount: number;
  secondRevisionEligible: boolean;
  qualityPoints: number | null;
  afterRevisionCap: number | null;
  revisionCapped: boolean;
  feedback: string;
  published: boolean;
  publishedAt: string | null;
  scores: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    points: number | null;
    required: boolean;
  }>;
};

function formatDay(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPts(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

function lateStatus(grade: FinalCutGradeCardData) {
  if (!grade.turnedInAt) {
    return { label: "Not submitted", tone: "neutral" as const, detail: "No Final Cut file is on this package yet." };
  }
  if (grade.daysLate <= 0) {
    return {
      label: "On time",
      tone: "approved" as const,
      detail: `Submitted ${formatDay(grade.turnedInAt)}. No late deduction.`
    };
  }
  const percent = Math.round(grade.penaltyMultiplier * 100);
  if (grade.blocksSecondRevision) {
    return {
      label: `Late · ${percent}% off`,
      tone: "danger" as const,
      detail: `${grade.daysLate} days past the ${formatDay(grade.deadlineAt)} deadline. 30% comes off the quality score. A second revision cannot repair this deduction.`
    };
  }
  return {
    label: `Late · ${percent}% off`,
    tone: "warn" as const,
    detail: `${grade.daysLate} day${grade.daysLate === 1 ? "" : "s"} past the ${formatDay(grade.deadlineAt)} deadline. ${percent}% will be taken off the quality average.`
  };
}

export function FinalCutGradeCard({
  grade,
  awarded,
  onAwardedChange,
  onSave,
  queued,
  onQueue,
  message
}: {
  grade: FinalCutGradeCardData;
  awarded: string;
  onAwardedChange: (value: string) => void;
  onSave: () => void;
  queued: boolean;
  onQueue: () => void;
  message?: string | null;
}) {
  const timing = lateStatus(grade);
  const waitingNames = grade.scores
    .filter((score) => score.required && score.points == null)
    .map((score) => score.name?.trim() || score.email || "Executive producer");

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">True quality score / 50</h3>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Each executive producer enters a score. Official grade is the average, then any revision cap and late
            deduction.
          </p>
        </div>
        <span className={cn("status-pill status-pill-sm", `status-${timing.tone}`)}>{timing.label}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-black/25 light:bg-muted px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Deadline</div>
          <div className="mt-1 text-sm text-foreground">{formatDay(grade.deadlineAt)}</div>
          {grade.extensionDays > 0 ? (
            <div className="mt-0.5 text-[11px] text-muted-foreground">Includes +{grade.extensionDays} extension days</div>
          ) : (
            <div className="mt-0.5 text-[11px] text-muted-foreground">No extension</div>
          )}
        </div>
        <div className="rounded-lg border border-border/70 bg-black/25 light:bg-muted px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Submitted</div>
          <div className="mt-1 text-sm text-foreground">{formatDay(grade.turnedInAt)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {grade.daysLate > 0 ? `${grade.daysLate} day${grade.daysLate === 1 ? "" : "s"} late` : "On or before deadline"}
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-black/25 light:bg-muted px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Deduction</div>
          <div className="mt-1 text-sm text-foreground">
            {grade.penaltyMultiplier > 0 ? `−${Math.round(grade.penaltyMultiplier * 100)}% late` : "None"}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {grade.blocksSecondRevision
              ? "30% cannot be repaired"
              : grade.penaltyMultiplier > 0
                ? "Taken off the official grade"
                : grade.secondRevisionEligible
                  ? "Second revision still allowed"
                  : "No late deduction"}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{timing.detail}</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Executive scores
          </div>
          {grade.scores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No executive producers are assigned yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
              {grade.scores.map((score) => {
                const isYou = score.userId === grade.viewerUserId;
                return (
                  <li key={score.userId} className="flex flex-wrap items-center gap-2 bg-black/20 light:bg-muted px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground">
                        {score.name || score.email || "Executive producer"}
                        {isYou ? <span className="ml-1.5 text-[11px] text-muted-foreground">You</span> : null}
                        {score.required ? null : (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">optional</span>
                        )}
                      </div>
                    </div>
                    {isYou && grade.canGrade ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
                          value={awarded}
                          onChange={(event) => onAwardedChange(event.target.value)}
                          inputMode="decimal"
                          placeholder="0–50"
                          aria-label="Your quality score"
                        />
                        <Button type="button" size="sm" onClick={onSave}>
                          Save
                        </Button>
                      </div>
                    ) : (
                      <span
                        className={cn(
                          "status-pill status-pill-sm",
                          score.points == null ? "status-neutral" : "status-approved"
                        )}
                      >
                        {score.points == null ? "Waiting" : `${score.points.toFixed(1)} / 50`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {grade.canGrade && !grade.scores.some((score) => score.userId === grade.viewerUserId) ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
                value={awarded}
                onChange={(event) => onAwardedChange(event.target.value)}
                inputMode="decimal"
                placeholder="0–50"
                aria-label="Your quality score"
              />
              <Button type="button" size="sm" onClick={onSave}>
                Save my score
              </Button>
            </div>
          ) : null}
          {!grade.canGrade ? (
            <p className="text-xs text-muted-foreground">Only executive producers enter scores.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Official grade
          </div>
          <div className="space-y-2 rounded-lg border border-border/70 bg-black/20 light:bg-muted px-3 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Quality average</span>
              <span className="tabular-nums text-foreground">{formatPts(grade.qualityPoints)} / 50</span>
            </div>
            {grade.revisionCapped ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Second revision cap 75%</span>
                <span className="tabular-nums text-[var(--brand-amber)]">
                  {formatPts(grade.afterRevisionCap)} / 50
                </span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">
                {grade.penaltyMultiplier > 0
                  ? `Late −${Math.round(grade.penaltyMultiplier * 100)}%`
                  : "Late deduction"}
              </span>
              <span className="tabular-nums text-foreground">
                {grade.penaltyMultiplier > 0 ? `−${Math.round(grade.penaltyMultiplier * 100)}%` : "None"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2 font-medium">
              <span className="text-foreground">Official</span>
              <span className="tabular-nums text-foreground">{formatPts(grade.officialPoints)} / 50</span>
            </div>
            {grade.complete ? null : (
              <p className="text-[11px] text-muted-foreground">
                {waitingNames.length === 0
                  ? "Waiting for scores."
                  : `Waiting on ${waitingNames.join(", ")}. Deduction applies once the average is in.`}
              </p>
            )}
            {grade.revisionCount >= 2 && !grade.revisionCapped ? (
              <p className="text-[11px] text-muted-foreground">This is a second revision. Cap is 37/50.</p>
            ) : null}
          </div>
        </div>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <Button type="button" variant="secondary" onClick={onQueue} className={cn(queued && "border-emerald-500/40")}>
          {queued ? "Remove from queue" : "Send to queue"}
        </Button>
        {queued ? <span className="status-pill status-pill-sm status-approved">Queued</span> : null}
      </div>
    </section>
  );
}
