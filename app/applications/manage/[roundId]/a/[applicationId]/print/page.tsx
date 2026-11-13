import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApplicationSummary } from "@/components/applications/application-summary";
import { PrintButton } from "@/components/applications/print-button";
import { formatPacific } from "@/src/lib/applications/format";
import { loadApplicationDetail } from "@/src/server/applications/page-data";

export const metadata: Metadata = { title: "Interview sheet" };

/** One printable page per applicant: answers, the top-3 summary, AI read and interview questions. */
export default async function InterviewSheetPage({ params }: { params: Promise<{ roundId: string; applicationId: string }> }) {
  const { roundId, applicationId } = await params;
  const { application, round, config, notes, ai } = await loadApplicationDetail(roundId, applicationId);
  const questions = notes.filter((note) => note.kind === "INTERVIEW");

  return (
    <article className="mx-auto max-w-[52rem] space-y-6 print:max-w-none print:text-[11pt]">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/applications/manage/${roundId}/a/${applicationId}` as never} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to applicant
        </Link>
        <PrintButton />
      </div>
      <header className="space-y-1 border-b border-border pb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{round.title} · Interview sheet</p>
        <h1 className="text-2xl font-semibold">{application.name}</h1>
        <p className="text-sm text-muted-foreground">{application.submittedAt ? `Submitted ${formatPacific(application.submittedAt)}` : "Not submitted"}</p>
      </header>

      <section className="space-y-2 print:break-inside-avoid">
        <h2 className="text-base font-semibold">Interview questions</h2>
        {questions.length ? (
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {questions.map((question) => (
              <li key={question.id}>
                <p className="whitespace-pre-line">{question.text}</p>
                <div aria-hidden className="mt-2 hidden h-16 border-b border-dashed border-border print:block" />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No interview questions yet. Add them on the applicant page.</p>
        )}
      </section>

      {ai ? (
        <section className="space-y-2 print:break-inside-avoid">
          <h2 className="text-base font-semibold">AI read (reference only)</h2>
          <p className="font-mono text-sm tabular-nums">
            {config.rubric.map((criterion) => `${criterion.label} ${ai.scores[criterion.key]?.score ?? "–"}`).join(" · ")}
            {ai.standing ? ` · ${ai.standing.place} of ${ai.standing.of}` : ""}
          </p>
        </section>
      ) : null}

      <ApplicationSummary answers={application.answers} config={config} hideNotes />
    </article>
  );
}
