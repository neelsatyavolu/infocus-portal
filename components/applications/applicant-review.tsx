"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { ApplicationSummary } from "@/components/applications/application-summary";
import { RoughCutPlayer } from "@/components/applications/rough-cut-player";
import { Field } from "@/components/kit/field";
import { IconButton } from "@/components/kit/icon-button";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ordinal } from "@/src/lib/applications/desk";
import { formatPacific, pacificInputToIso, toPacificInput } from "@/src/lib/applications/format";
import type { ApplicationDetail } from "@/src/server/applications/review";

/** One applicant, for reviewers: answers beside the rough cut, AI read, votes, notes and interview prep. */
export function ApplicantReview({ detail }: { detail: ApplicationDetail }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { application, round, config, viewer } = detail;
  const base = `/applications/manage/${round.id}`;

  function seek(t: number) {
    const video = videoRef.current;
    if (!video) {
      toast.message("The rough cut isn't available to play.");
      return;
    }
    video.currentTime = t;
    void video.play().catch(() => undefined);
    video.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <div className="space-y-5">
      <Link href={base as never} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All applicants
      </Link>
      <PageHeader
        eyebrow={round.title}
        status={
          <>
            {application.isMock ? <StatusTag tone="review">Mock</StatusTag> : null}
            {application.status === "SUBMITTED" ? <StatusTag tone="success">Submitted</StatusTag> : <StatusTag tone="warning">Draft</StatusTag>}
          </>
        }
        title={application.name}
        description={application.submittedAt ? `Submitted ${formatPacific(application.submittedAt)} · version ${application.version}` : "Not submitted"}
        actions={
          <Link href={`${base}/a/${application.id}/print` as never} className={buttonVariants({ variant: "outline" })}>
            <Printer aria-hidden />
            Interview sheet
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <div className="space-y-5">
          <Panel title="Application">
            <ApplicationSummary answers={application.answers} config={config} onSeek={seek} />
          </Panel>
          <NotesPanel detail={detail} kind="INTERVIEW" title="Interview prep" description="Follow-up questions drawn from the answers. They print on the interview sheet." />
          <NotesPanel detail={detail} kind="NOTE" title="Reviewer notes" description="Private to reviewers. Applicants never see these." />
        </div>

        <div className="space-y-5 lg:sticky lg:top-[calc(3.5rem+1.5rem)]">
          <Panel title="Rough cut" description="Click a note's timestamp to check it against the cut." padding="md">
            <RoughCutPlayer roundId={round.id} src={round.roughCutUrl} videoRef={videoRef} className="rounded-md" />
          </Panel>
          {application.status === "SUBMITTED" ? <VotePanel detail={detail} /> : null}
          <AiPanel detail={detail} />
          {viewer.canManage ? <ManagePanel detail={detail} /> : null}
        </div>
      </div>
    </div>
  );
}

function VotePanel({ detail }: { detail: ApplicationDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { votes, config, viewer, round, application } = detail;
  const locked = Boolean(round.releaseAt);
  const mine = votes.byVoter[viewer.userId] ?? null;
  const winner = config.decisions.find((decision) => decision.key === (application.decisionKey ?? votes.tally.winner));

  async function vote(optionKey: string | null) {
    setBusy(true);
    try {
      await send(`/api/applications/entries/${application.id}/vote`, "PUT", { optionKey });
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Final decision"
      padding="md"
      status={winner ? <StatusTag tone="success">{winner.label}</StatusTag> : <StatusTag tone="muted">{votes.tally.cast ? "Split" : "No votes"}</StatusTag>}
      description={`Needs ${votes.tally.needed} of ${votes.voters.length} votes.${locked ? " Votes are locked for release." : ""}`}
    >
      <div className="space-y-3">
        {viewer.isVoter ? (
          <div className="flex flex-wrap gap-2">
            {config.decisions.map((decision) => (
              <Button
                key={decision.key}
                size="sm"
                variant={mine === decision.key ? "default" : "outline"}
                aria-pressed={mine === decision.key}
                disabled={busy || locked}
                onClick={() => void vote(mine === decision.key ? null : decision.key)}
              >
                {decision.label}
              </Button>
            ))}
          </div>
        ) : null}
        <ul className="space-y-1 text-[13px]">
          {votes.voters.map((voter) => {
            const pick = config.decisions.find((decision) => decision.key === votes.byVoter[voter.id]);
            return (
              <li key={voter.id} className="flex justify-between gap-2">
                <span>{voter.name}</span>
                <span className={pick ? "text-foreground" : "text-muted-foreground"}>{pick?.label ?? "No vote"}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function AiPanel({ detail }: { detail: ApplicationDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { ai, config, viewer, application } = detail;

  async function run() {
    setBusy(true);
    try {
      await send(`/api/applications/entries/${application.id}/ai-read`, "POST");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="AI read"
      padding="md"
      status={<StatusTag tone="muted">Reference only</StatusTag>}
      description={ai?.standing ? `${ordinal(ai.standing.place)} of ${ai.standing.of} AI-read applicants · ${ai.standing.total} / ${config.rubric.length * 5}` : "Scores the written answers against the rubric. It never sees names or class records."}
      actions={
        viewer.canManage && application.status === "SUBMITTED" ? (
          <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy}>
            <Sparkles aria-hidden />
            {busy ? "Reading…" : ai ? "Re-run" : "Run"}
          </Button>
        ) : null
      }
    >
      {ai ? (
        <div className="space-y-3">
          <ul className="space-y-2.5">
            {config.rubric.map((criterion) => {
              const score = ai.scores[criterion.key];
              const place = ai.standing?.criteria[criterion.key]?.place;
              return (
                <li key={criterion.key} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{criterion.label}</span>
                    <span className="font-mono text-[13px] tabular-nums">
                      {score?.score ?? "–"}/5{place ? <span className="text-muted-foreground"> · {ordinal(place)}</span> : null}
                    </span>
                  </div>
                  {score?.reason ? <p className="text-[13px] leading-snug text-muted-foreground">{score.reason}</p> : null}
                </li>
              );
            })}
          </ul>
          {ai.summary ? <p className="border-t border-border pt-3 text-[13px] leading-snug">{ai.summary}</p> : null}
          {ai.readAt ? <p className="font-mono text-[11px] text-muted-foreground">Read {formatPacific(ai.readAt)}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{application.status === "SUBMITTED" ? "Not run yet." : "Runs once the application is submitted."}</p>
      )}
    </Panel>
  );
}

function NotesPanel({ detail, kind, title, description }: { detail: ApplicationDetail; kind: "NOTE" | "INTERVIEW"; title: string; description: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const notes = detail.notes.filter((note) => note.kind === kind);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await send(`/api/applications/entries/${detail.application.id}/notes`, "POST", { kind, text });
      setText("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    try {
      await send(`/api/applications/notes/${noteId}`, "DELETE");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Panel title={title} count={notes.length} description={description}>
      <div className="space-y-3">
        {notes.length ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {notes.map((note) => (
              <li key={note.id} className="flex gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="whitespace-pre-line break-words text-sm">{note.text}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {note.author} · {formatPacific(note.createdAt)}
                  </p>
                </div>
                {note.authorId === detail.viewer.userId || detail.viewer.canManage ? (
                  <IconButton label="Delete" icon={Trash2} size="sm" variant="ghost" onClick={() => void remove(note.id)} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            aria-label={kind === "INTERVIEW" ? "New interview question" : "New note"}
            rows={2}
            value={text}
            maxLength={4000}
            placeholder={kind === "INTERVIEW" ? "Ask about…" : "What stood out?"}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void add();
            }}
          />
          <Button variant="outline" onClick={() => void add()} disabled={busy || !text.trim()}>
            Add
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function ManagePanel({ detail }: { detail: ApplicationDetail }) {
  const router = useRouter();
  const { application } = detail;
  const [until, setUntil] = useState(toPacificInput(application.extensionUntil));
  const [note, setNote] = useState(application.extensionNote ?? "");
  const [message, setMessage] = useState(application.decisionMessage ?? "");
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await send(`/api/applications/entries/${application.id}`, "PATCH", body);
      toast.success(done);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Applicant settings" padding="md">
      <div className="space-y-4">
        {!application.isMock || application.email ? (
          <div className="space-y-2">
            <Field label="Extension until (Pacific)" htmlFor="ext-until" hint="Lets this applicant edit and submit after the deadline. Logged.">
              <Input id="ext-until" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
            <Input aria-label="Extension note" placeholder="Note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy || !until} onClick={() => void save({ extensionUntil: pacificInputToIso(until), extensionNote: note }, "Extension saved.")}>
                Save extension
              </Button>
              {application.extensionUntil ? (
                <Button size="sm" variant="destructive-quiet" disabled={busy} onClick={() => void save({ extensionUntil: null }, "Extension removed.")}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="space-y-2 border-t border-border pt-4">
          <Field label="Personal decision message" htmlFor="decision-message" hint="Optional. Replaces the decision's default message for this applicant only.">
            <Textarea id="decision-message" rows={3} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save({ decisionMessage: message }, "Message saved.")}>
            Save message
          </Button>
        </div>
      </div>
    </Panel>
  );
}
