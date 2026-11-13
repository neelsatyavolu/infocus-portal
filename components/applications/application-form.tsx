"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { send } from "@/components/applications/api";
import { AnswersStep } from "@/components/applications/answers-step";
import { ApplicationSummary } from "@/components/applications/application-summary";
import { CutStep } from "@/components/applications/cut-step";
import { DecisionCard } from "@/components/applications/decision-card";
import { FactsStep } from "@/components/applications/facts-step";
import { Alert } from "@/components/kit/alert";
import { Panel } from "@/components/kit/panel";
import { SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EMPTY_ANSWERS, validateForSubmit, type ApplicationAnswers, type SectionKey } from "@/src/lib/applications/answers";
import { countdown, formatPacific } from "@/src/lib/applications/format";
import { cn } from "@/src/lib/utils";
import type { MyApplicationView } from "@/src/server/applications/applicant";

const STEPS: { key: SectionKey | "review"; label: string }[] = [
  { key: "facts", label: "Quick facts" },
  { key: "answers", label: "Short answers" },
  { key: "cut", label: "Rough-cut feedback" },
  { key: "review", label: "Review & submit" }
];

const AUTOSAVE_MS = 1500;

export function ApplicationForm({ view }: { view: MyApplicationView }) {
  const { application, window: win } = view;
  const submitted = application?.status === "SUBMITTED";

  if (view.decision || submitted || !win.canEdit) {
    return <ReadOnlyApplication view={view} />;
  }
  return <EditableApplication view={view} />;
}

function Header({ view, status }: { view: MyApplicationView; status?: React.ReactNode }) {
  const { round } = view;
  return (
    <PageHeader
      eyebrow={round.positionLabel}
      status={
        <>
          {view.preview ? <StatusTag tone="review">Test copy (Mock)</StatusTag> : null}
          {status}
        </>
      }
      title={round.title}
      description={round.intro || undefined}
    />
  );
}

function ReadOnlyApplication({ view }: { view: MyApplicationView }) {
  const router = useRouter();
  const { round, application, window: win } = view;
  const [busy, setBusy] = useState(false);
  const canUnsubmit = application?.status === "SUBMITTED" && round.allowUnsubmit && win.canEdit && !view.decision;

  async function unsubmit() {
    setBusy(true);
    try {
      await send(`/api/applications/rounds/${round.id}/mine`, "POST", { action: "unsubmit" });
      toast.success("Unsubmitted. Make your changes, then submit again before the deadline.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't unsubmit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Header view={view} status={application?.status === "SUBMITTED" ? <StatusTag tone="success">Submitted</StatusTag> : <StatusTag tone="muted">Closed</StatusTag>} />
      {view.decision ? <DecisionCard title={round.title} decision={view.decision} /> : null}
      {application?.status === "SUBMITTED" ? (
        <Alert
          tone="success"
          title={`Submitted ${application.submittedAt ? formatPacific(application.submittedAt) : ""}`}
          action={
            canUnsubmit ? (
              <Button size="sm" variant="outline" onClick={unsubmit} disabled={busy}>
                Unsubmit to edit
              </Button>
            ) : undefined
          }
        >
          {canUnsubmit
            ? `You can still unsubmit and make changes until ${formatPacific(win.deadline)}.`
            : "Your application is locked. Here's what you sent."}
        </Alert>
      ) : (
        <Alert tone="warning" title={win.opened ? `Applications closed ${formatPacific(win.deadline)}` : "This application isn't open yet"}>
          {application ? "Your draft was not submitted." : "You didn't start this application."}
        </Alert>
      )}
      {application ? (
        <section className="rounded-md border border-border bg-card p-4 md:p-5">
          <ApplicationSummary answers={application.answers} config={round.config} />
        </section>
      ) : null}
    </div>
  );
}

function EditableApplication({ view }: { view: MyApplicationView }) {
  const router = useRouter();
  const { round, window: win } = view;
  const config = round.config;
  const [answers, setAnswers] = useState<ApplicationAnswers>(view.application?.answers ?? EMPTY_ANSWERS);
  const [attested, setAttested] = useState(view.application?.attested ?? false);
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState<SaveStateValue>(view.application ? "saved" : "idle");
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState(() => countdown(win.deadline));
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const latest = useRef({ answers, attested });
  useEffect(() => {
    latest.current = { answers, attested };
  }, [answers, attested]);

  const flush = useCallback(async () => {
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    const run = send(`/api/applications/rounds/${round.id}/mine`, "PUT", latest.current)
      .then(() => setSaveState(dirty.current ? "dirty" : "saved"))
      .catch((error: unknown) => {
        dirty.current = true;
        setSaveState("error");
        toast.error(error instanceof Error ? error.message : "Couldn't save your draft.", { id: "application-save" });
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    await run;
  }, [round.id]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setSaveState("dirty");
  }, []);

  const patch = useCallback(
    (next: Partial<ApplicationAnswers>) => {
      setAnswers((prev) => ({ ...prev, ...next }));
      markDirty();
    },
    [markDirty]
  );

  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [answers, attested, flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    const tick = setInterval(() => setLeft(countdown(win.deadline)), 30_000);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearInterval(tick);
    };
  }, [win.deadline]);

  const problems = useMemo(() => validateForSubmit(answers, config, attested), [answers, config, attested]);
  const problemsBySection = (section: SectionKey) => problems.filter((problem) => problem.section === section && problem.field !== "attested").length;

  function go(next: number) {
    void flush();
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    setSubmitting(true);
    try {
      dirty.current = false;
      if (inFlight.current) await inFlight.current;
      await send(`/api/applications/rounds/${round.id}/mine`, "POST", { action: "submit", answers, attested });
      toast.success("Application submitted.");
      router.refresh();
    } catch (error) {
      dirty.current = true;
      toast.error(error instanceof Error ? error.message : "Couldn't submit.");
    } finally {
      setSubmitting(false);
    }
  }

  const current = STEPS[step]!;

  return (
    <div className="space-y-5" onBlur={() => void flush()}>
      {view.preview ? (
        <Alert tone="info" title="Student preview">
          {round.status === "DRAFT" ? "This round is a hidden draft; students can't see it yet. " : ""}
          This is exactly what students see. Anything you type saves as a test copy tagged Mock, which you can submit to try the reviewer side. Remove mocks deletes it.
        </Alert>
      ) : null}
      <Header
        view={view}
        status={
          <>
            <StatusTag tone="warning">Draft</StatusTag>
            <SaveState state={saveState} />
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          Due <span className="font-medium text-foreground">{formatPacific(win.deadline)}</span>
        </p>
        {left ? <StatusTag tone={left.includes("day") ? "neutral" : "warning"}>{left}</StatusTag> : null}
      </div>

      <nav aria-label="Application sections" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((item, index) => {
          const issues = item.key === "review" ? 0 : problemsBySection(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => go(index)}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                index === step ? "border-[var(--brand-green)] bg-[var(--ink-3)] font-medium" : "border-border hover:bg-[var(--ink-3)]"
              )}
            >
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
              {issues > 0 && index !== step ? <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{issues} left</span> : null}
            </button>
          );
        })}
      </nav>

      <Panel title={current.label} titleAs="h2">
        {current.key === "facts" ? <FactsStep answers={answers} config={config} applicantName={view.applicantName} onChange={patch} /> : null}
        {current.key === "answers" ? <AnswersStep answers={answers} config={config} onChange={patch} /> : null}
        {current.key === "cut" ? <CutStep roundId={round.id} hasRoughCut={round.hasRoughCut} answers={answers} config={config} onChange={patch} /> : null}
        {current.key === "review" ? (
          <div className="space-y-5">
            <ApplicationSummary answers={answers} config={config} onEdit={(section) => go(STEPS.findIndex((item) => item.key === section))} />
            {problems.filter((problem) => problem.field !== "attested").length ? (
              <Alert tone="warning" title="Finish these before you submit">
                <ul className="list-disc space-y-0.5 pl-5">
                  {problems
                    .filter((problem) => problem.field !== "attested")
                    .map((problem, index) => (
                      <li key={index}>{problem.message}</li>
                    ))}
                </ul>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-4">
              <Checkbox
                checked={attested}
                onCheckedChange={(on) => {
                  setAttested(on);
                  markDirty();
                }}
              >
                {config.attestation}
              </Checkbox>
              <Button className="shrink-0" onClick={submit} disabled={submitting || problems.length > 0}>
                <Send aria-hidden />
                {submitting ? "Submitting…" : "Submit application"}
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="outline" onClick={() => go(step + 1)}>
            Next: {STEPS[step + 1]!.label}
            <ArrowRight aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
