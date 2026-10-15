"use client";

import { StatusTag } from "@/components/kit/status-tag";
import { TableShell } from "@/components/kit/data-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FinalCutMemberGradeData } from "@/components/package-cycle/final-cut-grade-card";
import {
  automaticPenaltyLabel,
  formatPts,
  memberGradeSummary,
  PART_MAX,
  penaltyTriggerLabel,
  percentOf,
  typedTotal,
  type GradeDraft
} from "@/components/package-stages/grade-helpers";
import { firstName, personLabel } from "@/components/package-stages/types";
import { LATE_PENALTY_OVERRIDE_PERCENTS } from "@/src/lib/package-extensions";
import { cn } from "@/src/lib/utils";

export type MemberGradeRowsProps = {
  members: FinalCutMemberGradeData[];
  canGrade: boolean;
  viewerUserId: string;
  draft: GradeDraft;
  onDraftChange: (memberUserId: string, next: { quality: string; effort: string }) => void;
  savingPenaltyFor: string | null;
  onPenaltyChange: (memberUserId: string, percent: number | null) => void;
};

const EMPTY_ENTRY = { quality: "", effort: "" };
const CAPS = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

function PartInput({
  value,
  onChange,
  label,
  touch = false
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Phone cards: 40px tall, full width. */
  touch?: boolean;
}) {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="decimal"
      placeholder={`0–${PART_MAX}`}
      aria-label={label}
      className={cn("px-2 font-mono-broadcast tabular-nums", touch ? "h-10" : "h-8 w-20 text-right")}
    />
  );
}

/** Each executive producer's score for one member, so graders can see each other's numbers. */
function GraderScores({ member, viewerUserId }: { member: FinalCutMemberGradeData; viewerUserId: string }) {
  if (member.graderScores.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Scores by executive producer">
      {member.graderScores.map((grader) => {
        const scored = grader.quality != null && grader.effort != null;
        return (
          <li key={grader.userId} className={scored ? "text-foreground" : "text-muted-foreground"}>
            <span className="text-muted-foreground">
              {firstName(grader.name)}
              {grader.userId === viewerUserId ? " (you)" : ""}
            </span>{" "}
            {scored ? (
              <span className="font-mono-broadcast tabular-nums">
                {formatPts(grader.quality)} + {formatPts(grader.effort)} ={" "}
                {formatPts((grader.quality ?? 0) + (grader.effort ?? 0))}
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

/** Average / waiting-on line and each EP's scores, under a member. */
function MemberDetail({ member, viewerUserId }: { member: FinalCutMemberGradeData; viewerUserId: string }) {
  return (
    <div className="space-y-1 text-[13px] leading-snug text-muted-foreground">
      <p>{memberGradeSummary(member)}</p>
      <GraderScores member={member} viewerUserId={viewerUserId} />
    </div>
  );
}

/** The late penalty this member will get; execs can replace the automatic one. */
function LatePenalty({
  member,
  canEdit,
  saving,
  onChange,
  touch = false
}: {
  member: FinalCutMemberGradeData;
  canEdit: boolean;
  saving: boolean;
  onChange: (percent: number | null) => void;
  touch?: boolean;
}) {
  const name = personLabel(member);
  const effective = percentOf(member.penaltyMultiplier);
  if (!canEdit) {
    return (
      <span className="text-sm text-[var(--ink-text)]">
        {effective > 0 ? `−${effective}%` : "None"}
        {member.latePenaltyPercent != null ? (
          <span className="text-muted-foreground"> · set by an executive producer</span>
        ) : null}
      </span>
    );
  }
  return (
    <Select
      value={member.latePenaltyPercent == null ? "auto" : String(member.latePenaltyPercent)}
      onValueChange={(value) => onChange(value === "auto" ? null : Number(value))}
      disabled={saving}
    >
      <SelectTrigger
        className={cn("min-w-0", touch ? "h-10 w-full text-base" : "h-8 w-44 text-sm")}
        aria-label={`${name} late penalty`}
      >
        <SelectValue>{penaltyTriggerLabel(member)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Automatic ({automaticPenaltyLabel(member)})</SelectItem>
        {LATE_PENALTY_OVERRIDE_PERCENTS.map((percent) => (
          <SelectItem key={percent} value={String(percent)}>
            −{percent}%
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Members who scored 75% or more before a second revision keep that grade. */
function LockedTag() {
  return <StatusTag tone="neutral">Keeps grade · not revising</StatusTag>;
}

/** Wide screens: one row per member (inputs, totals, penalty) with a muted detail row under it. */
export function MemberGradeTable({
  members,
  canGrade,
  viewerUserId,
  draft,
  onDraftChange,
  savingPenaltyFor,
  onPenaltyChange
}: MemberGradeRowsProps) {
  return (
    <TableShell caption="Member grades" tableClassName="[&_tbody_tr:hover]:bg-transparent">
      <thead>
        <tr>
          <th scope="col">Member</th>
          {canGrade ? (
            <>
              <th scope="col" className="text-right!">
                Quality /25
              </th>
              <th scope="col" className="text-right!">
                Effort /25
              </th>
              <th scope="col" className="text-right!">
                Yours /50
              </th>
            </>
          ) : null}
          <th scope="col" className="text-right!">
            Official /50
          </th>
          <th scope="col">Late penalty</th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => {
          const name = personLabel(member);
          const entry = draft[member.userId] ?? EMPTY_ENTRY;
          const total = typedTotal(entry);
          const editable = canGrade && !member.locked;
          return [
            <tr key={member.userId} className="[&>td]:border-b-0!">
              <td className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-foreground">{name}</span>
                  {member.locked ? <LockedTag /> : null}
                </div>
              </td>
              {canGrade ? (
                <>
                  <td className="text-right">
                    {editable ? (
                      <PartInput
                        value={entry.quality}
                        onChange={(value) => onDraftChange(member.userId, { ...entry, quality: value })}
                        label={`${name} quality score`}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {editable ? (
                      <PartInput
                        value={entry.effort}
                        onChange={(value) => onDraftChange(member.userId, { ...entry, effort: value })}
                        label={`${name} effort score`}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-right font-mono-broadcast tabular-nums text-foreground">
                    {editable && total != null ? total.toFixed(1) : "—"}
                  </td>
                </>
              ) : null}
              <td className="text-right font-mono-broadcast font-medium tabular-nums text-foreground">
                {formatPts(member.officialPoints)}
              </td>
              <td>
                <LatePenalty
                  member={member}
                  canEdit={canGrade}
                  saving={savingPenaltyFor === member.userId}
                  onChange={(percent) => onPenaltyChange(member.userId, percent)}
                />
              </td>
            </tr>,
            <tr key={`${member.userId}-detail`}>
              <td colSpan={canGrade ? 6 : 3} className="pt-0!">
                <MemberDetail member={member} viewerUserId={viewerUserId} />
              </td>
            </tr>
          ];
        })}
      </tbody>
    </TableShell>
  );
}

/** Phones and narrow screens: one card per member with 40px inputs and a full-width penalty picker. */
export function MemberGradeCards({
  members,
  canGrade,
  viewerUserId,
  draft,
  onDraftChange,
  savingPenaltyFor,
  onPenaltyChange
}: MemberGradeRowsProps) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {members.map((member) => {
        const name = personLabel(member);
        const entry = draft[member.userId] ?? EMPTY_ENTRY;
        const total = typedTotal(entry);
        const editable = canGrade && !member.locked;
        return (
          <li key={member.userId} className="min-w-0 space-y-3 p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground">{name}</span>
                {member.locked ? <LockedTag /> : null}
              </div>
              <div className="shrink-0 text-right">
                <div className={CAPS}>Official</div>
                <div className="font-mono-broadcast text-base font-medium tabular-nums text-foreground">
                  {formatPts(member.officialPoints)} <span className="text-[13px] text-muted-foreground">/ 50</span>
                </div>
              </div>
            </div>
            {editable ? (
              <div className="grid grid-cols-3 items-end gap-3">
                <label className="min-w-0 space-y-1">
                  <span className={CAPS}>Quality /25</span>
                  <PartInput
                    touch
                    value={entry.quality}
                    onChange={(value) => onDraftChange(member.userId, { ...entry, quality: value })}
                    label={`${name} quality score`}
                  />
                </label>
                <label className="min-w-0 space-y-1">
                  <span className={CAPS}>Effort /25</span>
                  <PartInput
                    touch
                    value={entry.effort}
                    onChange={(value) => onDraftChange(member.userId, { ...entry, effort: value })}
                    label={`${name} effort score`}
                  />
                </label>
                <div className="min-w-0 space-y-1">
                  <div className={CAPS}>Yours /50</div>
                  <div className="flex h-10 items-center font-mono-broadcast tabular-nums text-foreground">
                    {total == null ? "—" : total.toFixed(1)}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="space-y-1">
              <div className={CAPS}>Late penalty</div>
              <LatePenalty
                touch
                member={member}
                canEdit={canGrade}
                saving={savingPenaltyFor === member.userId}
                onChange={(percent) => onPenaltyChange(member.userId, percent)}
              />
            </div>
            <MemberDetail member={member} viewerUserId={viewerUserId} />
          </li>
        );
      })}
    </ul>
  );
}
