import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { MarketingPage } from "@/components/public-marketing/marketing-page";
import { buttonVariants } from "@/components/ui/button";

const workflow = [
  {
    step: 1,
    title: "Upload",
    body: "Upload package videos from the browser and watch the upload speed and progress."
  },
  {
    step: 2,
    title: "Review",
    body: "Teammates and guests comment at exact timestamps and reply in threads."
  },
  {
    step: 3,
    title: "Revise",
    body: "Upload a new version of the same video. Comments on earlier versions stay linked and searchable."
  },
  {
    step: 4,
    title: "Approve",
    body: "Move each version through review statuses, with a record of every step up to final sign-off."
  }
];

export const metadata: Metadata = { title: "Workflow" };

/**
 * Each step card keeps its "Production-ready step" marker, as a neutral tag in a status slot
 * pinned to the card's bottom, so the tags line up across a row. Four cards to a row only from
 * xl, where the tag fits on one line. The page's own action (Start reviewing, into the Portal) is
 * the primary, last, as on /security; View security is the outline beside it.
 */
export default function WorkflowPage() {
  return (
    <MarketingPage active="workflow">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Workflow"
          title="From first cut to final"
          description="The same steps for every package, for class members and outside reviewers."
          actions={
            <>
              <Link href="/security" className={buttonVariants({ variant: "outline" })}>
                View security
              </Link>
              <Link href="/dashboard" className={buttonVariants()}>
                Start reviewing
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </>
          }
        />

        <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {workflow.map((step) => (
            <li key={step.step} className="min-w-0">
              <Panel as="div" bodyClassName="flex flex-col">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--ink-3)] text-sm font-semibold text-foreground"
                  >
                    {step.step}
                  </span>
                  <h2 className="min-w-0 text-lg font-semibold leading-snug text-foreground">
                    <span className="sr-only">{step.step}. </span>
                    {step.title}
                  </h2>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{step.body}</p>
                <div className="mt-auto pt-4">
                  <StatusTag icon={CheckCircle2}>Production-ready step</StatusTag>
                </div>
              </Panel>
            </li>
          ))}
        </ol>
      </div>
    </MarketingPage>
  );
}
