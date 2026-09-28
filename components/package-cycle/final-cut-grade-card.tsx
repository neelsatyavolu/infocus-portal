"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

export type FinalCutMemberGradeData = {
  userId: string;
  name: string | null;
  email: string | null;
  myQuality: number | null;
  myEffort: number | null;
  locked: boolean;
  complete: boolean;
  pendingCount: number;
  qualityAverage: number | null;
  effortAverage: number | null;
  average: number | null;
  afterRevisionCap: number | null;
  revisionCapped: boolean;
  officialPoints: number | null;
  revisionCount: number;
  secondRevisionEligible: boolean;
  daysLate: number;
  penaltyMultiplier: number;
  graderScores: Array<{ userId: string; name: string; required: boolean; quality: number | null; effort: number | null }>;
};

export type FinalCutGradeCardData = {
  canGrade: boolean;
  complete: boolean;
  viewerUserId: string;
  deadlineAt: string | null;
  turnedInAt: string | null;
  extensionDays: number;
  daysLate: number;
  penaltyMultiplier: number;
  blocksSecondRevision: boolean;
  secondRevisionEligible: boolean;
  feedback: string;
  published: boolean;
  publishedAt: string | null;
  members: FinalCutMemberGradeData[];
  graders: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    required: boolean;
    scoredCount: number;
  }>;
};

export type FinalCutScoreInput = { memberUserId: string; qualityPoints: number; effortPoints: number };

type Draft = Record<string, { quality: string; effort: string }>;

const PART_MAX = 25;

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
      detail: `${grade.daysLate} days past the ${formatDay(grade.deadlineAt)} deadline. 30% comes off each member's score. A second revision cannot repair this deduction.`
    };
  }
  return {
    label: `Late · ${percent}% off`,
    tone: "warn" as const,
    detail: `${grade.daysLate} day${grade.daysLate === 1 ? "" : "s"} past the ${formatDay(grade.deadlineAt)} deadline. ${percent}% will be taken off each member's average.`
  };
}

function draftFrom(members: FinalCutMemberGradeData[]): Draft {
  return Object.fromEntries(
    members.map((member) => [
      member.userId,
      {
        quality: member.myQuality == null ? "" : String(member.myQuality),
        effort: member.myEffort == null ? "" : String(member.myEffort)
      }
    ])
  );
}

function parsePart(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= PART_MAX ? parsed : Number.NaN;
}

/** Filled rows become scores; a half-filled or out-of-range row is an error. */
function scoresFromDraft(members: FinalCutMemberGradeData[], draft: Draft) {
  const scores: FinalCutScoreInput[] = [];
  for (const member of members) {
    if (member.locked) continue;
    const entry = draft[member.userId];
    const quality = parsePart(entry?.quality ?? "");
    const effort = parsePart(entry?.effort ?? "");
    if (quality === null && effort === null) continue;
    const label = member.name?.trim() || member.email || "a member";
    if (quality === null || effort === null) {
      return { error: `Enter both quality and effort for ${label}.` };
    }
    if (Number.isNaN(quality) || Number.isNaN(effort)) {
      return { error: `Scores for ${label} must be between 0 and ${PART_MAX}.` };
    }
    scores.push({ memberUserId: member.userId, qualityPoints: quality, effortPoints: effort });
  }
  return scores.length === 0 ? { error: "Enter at least one member's scores." } : { scores };
}

function PartInput({
  value,
  onChange,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="decimal"
      placeholder={`0–${PART_MAX}`}
      aria-label={label}
    />
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** Each executive producer's score for one member, so graders can see each other's numbers. */
function GraderScores({ member, viewerUserId }: { member: FinalCutMemberGradeData; viewerUserId: string }) {
  if (member.graderScores.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Scores by executive producer">
      {member.graderScores.map((grader) => {
        const scored = grader.quality != null && grader.effort != null;
        return (
          <li key={grader.userId} className={scored ? "text-foreground" : "text-muted-foreground"}>
            <span className="text-muted-foreground">
              {firstName(grader.name)}
              {grader.userId === viewerUserId ? " (you)" : ""}
            </span>{" "}
            {scored ? (
              <span className="font-mono tabular-nums">
                {formatPts(grader.quality)} + {formatPts(grader.effort)} = {formatPts((grader.quality ?? 0) + (grader.effort ?? 0))}
              </span>
            ) : (
              "not scored"
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MemberRow({
  member,
  canGrade,
  viewerUserId,
  draft,
  onDraftChange
}: {
  member: FinalCutMemberGradeData;
  canGrade: boolean;
  viewerUserId: string;
  draft: { quality: string; effort: string };
  onDraftChange: (next: { quality: string; effort: string }) => void;
}) {
  const name = member.name?.trim() || member.email || "Member";
  const quality = parsePart(draft.quality);
  const effort = parsePart(draft.effort);
  const myTotal =
    quality != null && effort != null && !Number.isNaN(quality) && !Number.isNaN(effort) ? quality + effort : null;
  const waitingOn = member.graderScores
    .filter((grader) => grader.required && (grader.quality == null || grader.effort == null))
    .map((grader) => firstName(grader.name));

  return (
    <li className="space-y-2 bg-black/20 light:bg-muted px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</div>
        {member.locked ? (
          <span className="status-pill status-pill-sm status-neutral">Keeps grade · not revising</span>
        ) : canGrade ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5">
              Quality
              <PartInput
                value={draft.quality}
                onChange={(value) => onDraftChange({ ...draft, quality: value })}
                label={`${name} quality score`}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Effort
              <PartInput
                value={draft.effort}
                onChange={(value) => onDraftChange({ ...draft, effort: value })}
                label={`${name} effort score`}
              />
            </label>
            <span className="w-14 text-right font-mono text-[11px] tabular-nums text-foreground">{myTotal == null ? "—" : myTotal.toFixed(1)} / 50</span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {member.complete
            ? `Average quality ${formatPts(member.qualityAverage)} + effort ${formatPts(member.effortAverage)} = ${formatPts(member.average)}`
            : member.locked
              ? "Scored 75% or more before this revision."
              : waitingOn.length > 0
                ? `Waiting on ${waitingOn.join(", ")}`
                : `Waiting on ${member.pendingCount} executive producer${member.pendingCount === 1 ? "" : "s"}`}
          {member.revisionCapped ? ` · second revision cap ${formatPts(member.afterRevisionCap)}` : ""}
          {member.penaltyMultiplier > 0 ? ` · −${Math.round(member.penaltyMultiplier * 100)}% late` : ""}
        </span>
        <span className="font-medium tabular-nums text-foreground">Official {formatPts(member.officialPoints)} / 50</span>
      </div>
      <GraderScores member={member} viewerUserId={viewerUserId} />
    </li>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

export function FinalCutGradeCard({
  grade,
  onSave,
  message
}: {
  grade: FinalCutGradeCardData;
  onSave: (scores: FinalCutScoreInput[]) => Promise<void>;
  message?: string | null;
}) {
  const timing = lateStatus(grade);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(grade.members));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reset typed scores only when saved scores change, so unrelated reloads keep unsaved input.
  const savedKey = grade.members.map((member) => `${member.userId}:${member.myQuality}:${member.myEffort}`).join("|");
  const [draftSavedKey, setDraftSavedKey] = useState(savedKey);
  if (savedKey !== draftSavedKey) {
    setDraftSavedKey(savedKey);
    setDraft(draftFrom(grade.members));
  }

  const scoringMembers = grade.members.filter((member) => !member.locked).length;

  async function save() {
    const result = scoresFromDraft(grade.members, draft);
    if ("error" in result) {
      setError(result.error ?? null);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(result.scores);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Member grades / 50</h3>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Each executive producer scores every member: quality out of 25 and effort out of 25. A member&apos;s
            official grade is the average of those totals, then any revision cap and late deduction.
          </p>
        </div>
        <span className={cn("status-pill status-pill-sm", `status-${timing.tone}`)} title={timing.detail}>
          {timing.label}
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border/60 rounded-lg border border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          label="Deadline"
          value={formatDay(grade.deadlineAt)}
          detail={grade.extensionDays > 0 ? `Includes +${grade.extensionDays} extension days` : "No extension"}
        />
        <Stat
          label="Submitted"
          value={formatDay(grade.turnedInAt)}
          detail={grade.daysLate > 0 ? `${grade.daysLate} day${grade.daysLate === 1 ? "" : "s"} late` : "On or before deadline"}
        />
        <Stat
          label="Deduction"
          value={grade.penaltyMultiplier > 0 ? `−${Math.round(grade.penaltyMultiplier * 100)}% late` : "None"}
          detail={
            grade.blocksSecondRevision
              ? "30% cannot be repaired"
              : grade.penaltyMultiplier > 0
                ? "Taken off the official grade"
                : grade.secondRevisionEligible
                  ? "Second revision still allowed"
                  : "No late deduction"
          }
        />
      </div>
      {grade.daysLate > 0 ? <p className="text-sm text-muted-foreground">{timing.detail}</p> : null}

      {grade.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">This package has no members.</p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
          {grade.members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              canGrade={grade.canGrade}
              viewerUserId={grade.viewerUserId}
              draft={draft[member.userId] ?? { quality: "", effort: "" }}
              onDraftChange={(next) => setDraft((current) => ({ ...current, [member.userId]: next }))}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {grade.canGrade && scoringMembers > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save my scores"}
            </Button>
            {error ? <span className="text-xs text-danger">{error}</span> : null}
          </div>
        ) : !grade.canGrade ? (
          <p className="text-xs text-muted-foreground">Only executive producers enter scores.</p>
        ) : (
          <span />
        )}
        {grade.graders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No executive producers are assigned yet.</p>
        ) : (
          <ul className="flex flex-wrap justify-end gap-1.5" aria-label="Executive producer progress">
            {grade.graders.map((grader) => {
              const done = scoringMembers > 0 && grader.scoredCount >= scoringMembers;
              return (
                <li
                  key={grader.userId}
                  className={cn("status-pill status-pill-sm", done ? "status-approved" : "status-neutral")}
                >
                  {grader.name || grader.email || "Executive producer"}
                  {grader.userId === grade.viewerUserId ? " (you)" : ""}
                  {grader.required ? "" : " · optional"}
                  {" · "}
                  {done ? "Done" : `${Math.min(grader.scoredCount, scoringMembers)}/${scoringMembers}`}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
