import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countWords, formatTimestamp, type ApplicationAnswers, type SectionKey } from "@/src/lib/applications/answers";
import type { ApplicantConfig } from "@/src/lib/applications/config";

type Props = {
  answers: ApplicationAnswers;
  config: Pick<ApplicantConfig, "questions" | "roughCut">;
  /** Edit links per section (the applicant's Review & Submit step). */
  onEdit?: (section: SectionKey) => void;
  /** Clicking a note's timestamp seeks the player (reviewers and applicants). */
  onSeek?: (t: number) => void;
  /** Leave out the rough-cut notes (the print sheet shows only the summary). */
  hideNotes?: boolean;
};

const empty = <span className="text-muted-foreground">Not answered</span>;

/** An application, read-only, in the order the applicant filled it in. */
export function ApplicationSummary({ answers, config, onEdit, onSeek, hideNotes = false }: Props) {
  return (
    <div className="space-y-6">
      <SummarySection title="Quick facts" section="facts" onEdit={onEdit}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item label="Grade next year">{answers.grade || empty}</Item>
          <Item label="Years in InFocus (full)">{answers.years || empty}</Item>
          <Item label="Current role">{answers.currentRole || empty}</Item>
          <Item label="Previous roles">{answers.pastRoles.join(", ") || <span className="text-muted-foreground">None</span>}</Item>
          <Item label="Enrolling next year">{answers.enrollingNextYear ? (answers.enrollingNextYear === "yes" ? "Yes" : "No") : empty}</Item>
          <Item label="Weekly hours on other commitments">{answers.hours || empty}</Item>
          <Item label="Leadership outside InFocus">
            {answers.leadership.length ? (
              <ul className="space-y-0.5">
                {answers.leadership.map((row, index) => (
                  <li key={index}>
                    {row.role} · {row.org}
                    {row.years ? <span className="text-muted-foreground"> ({row.years})</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">None listed</span>
            )}
          </Item>
          <Item label="Other commitments">{answers.commitments || empty}</Item>
          <Item label="Skills" wide>
            {answers.skills.join(", ") || empty}
          </Item>
        </dl>
      </SummarySection>

      <SummarySection title="Short answers" section="answers" onEdit={onEdit}>
        <div className="space-y-5">
          {config.questions.map((question, index) => {
            const value = index === 0 ? answers.answer1 : answers.answer2;
            return <Prose key={index} label={question.prompt} value={value} max={question.maxWords} />;
          })}
        </div>
      </SummarySection>

      <SummarySection title="Rough-cut feedback" section="cut" onEdit={onEdit}>
        <div className="space-y-5">
          {hideNotes ? null : (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">Notes ({answers.cutNotes.length})</p>
              {answers.cutNotes.length ? (
                <ol className="divide-y divide-border rounded-md border border-border">
                  {answers.cutNotes.map((note) => (
                    <li key={note.id} className="flex gap-3 px-3 py-2.5 text-sm">
                      {onSeek ? (
                        <Button type="button" size="sm" variant="outline" className="shrink-0 font-mono tabular-nums" onClick={() => onSeek(note.t)}>
                          {formatTimestamp(note.t)}
                        </Button>
                      ) : (
                        <span className="w-12 shrink-0 pt-0.5 font-mono tabular-nums text-muted-foreground">{formatTimestamp(note.t)}</span>
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[12px] font-medium text-muted-foreground">{note.category || "No category"}</p>
                        <p className="whitespace-pre-line break-words">{note.text || empty}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </div>
          )}
          <Prose label={config.roughCut.summaryPrompt} value={answers.cutSummary} max={config.roughCut.summaryMaxWords} />
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
            <Item label="Air decision">{answers.airDecision || empty}</Item>
            <Item label="Why">{answers.airReason || empty}</Item>
          </dl>
        </div>
      </SummarySection>
    </div>
  );
}

function SummarySection({
  title,
  section,
  onEdit,
  children
}: {
  title: string;
  section: SectionKey;
  onEdit?: (section: SectionKey) => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0 print:break-inside-avoid">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {onEdit ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(section)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Item({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function Prose({ label, value, max }: { label: string; value: string; max: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
          {countWords(value)} / {max}
        </span>
      </div>
      <p className="max-w-[75ch] whitespace-pre-line break-words text-sm leading-relaxed">{value || empty}</p>
    </div>
  );
}
