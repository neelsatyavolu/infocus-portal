import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";

const workflow = [
  {
    title: "1. Upload",
    body: "Upload package videos directly from the browser and track live progress with speed and percentage."
  },
  {
    title: "2. Review",
    body: "Invite teammates or guests to comment at exact timestamps and reply in focused threads."
  },
  {
    title: "3. Revise",
    body: "Upload a new version to the same asset so historical comments remain linked and searchable."
  },
  {
    title: "4. Approve",
    body: "Move versions through review statuses and keep a clear audit trail for final sign-off."
  }
];

export default function WorkflowPage() {
  return (
    <>
      <MarketingHeader active="workflow" />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-10">

      <section className="rounded-3xl border border-border bg-card p-7 md:p-10">
        <h1 className="text-4xl font-semibold text-foreground md:text-5xl">A clear workflow from first cut to final</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Keep every package organized in one repeatable process that works for internal teams and external reviewers.
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {workflow.map((step) => (
          <article key={step.title} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold text-foreground">{step.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            <div className="mt-3 inline-flex items-center gap-1 text-xs text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Production-ready step
            </div>
          </article>
        ))}
      </section>

      <section className="mt-8 flex flex-wrap gap-3">
        <Link href="/security" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground">
          View Security
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground">
          Start Reviewing
        </Link>
      </section>
      </main>
    </>
  );
}
