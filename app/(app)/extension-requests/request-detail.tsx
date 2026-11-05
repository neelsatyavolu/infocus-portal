"use client";

import type { ReactNode } from "react";
import { AlertCircle, Check, Clock, X } from "lucide-react";
import { KeyValueList, KeyValueRow } from "@/components/kit/key-value";
import { SectionLabel } from "@/components/kit/section";
import { StepList, type StepState } from "@/components/kit/segment-nav";
import { StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";
import { RequestActionArea, type RequestActions } from "./request-actions";
import { daysLabel, grantedNames, shortDate, type MemberLine, type RequestView } from "./request-view";

type Step = { title: string; tally?: string; state: StepState; tag?: ReactNode; body: ReactNode };

function Mark({ label, you, tone, word }: { label: string; you: boolean; tone: "ok" | "no" | "wait"; word: string }) {
  const Icon = tone === "ok" ? Check : tone === "no" ? X : Clock;
  return (
    <span className="flex min-h-7 min-w-0 items-center gap-3 text-sm">
      <span className="min-w-0 flex-1 truncate text-foreground">
        {label}
        {you ? <span className="text-muted-foreground"> (you)</span> : null}
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
          tone === "ok" ? "text-[var(--brand-green)]" : tone === "no" ? "text-danger" : "text-muted-foreground"
        )}
      >
        <Icon aria-hidden className="h-4 w-4" />
        {word}
      </span>
    </span>
  );
}

function stepTag(tone: StatusToneInput, label: string) {
  return <StatusTag tone={tone}>{label}</StatusTag>;
}

function memberWord(member: MemberLine, pending: boolean) {
  if (member.mark === "agreed") return <Mark label={member.label} you={member.you} tone="ok" word="Agreed" />;
  if (member.mark === "declined") return <Mark label={member.label} you={member.you} tone="no" word="Declined" />;
  return <Mark label={member.label} you={member.you} tone="wait" word={pending ? "Waiting" : "No response"} />;
}

function agreementStep(view: RequestView): Step {
  const { entry } = view;
  const pending = entry.status === "PENDING";
  if (entry.producerGranted) {
    return {
      title: "Group agreement",
      state: "skipped",
      tag: stepTag("muted", "Not needed"),
      body: "Exec grant: no member agreement needed."
    };
  }
  const declined = view.members.some((member) => member.mark === "declined");
  // A producer may deny before everyone agrees; the closed request never reached full agreement.
  const state: StepState = declined
    ? "blocked"
    : entry.memberConsentComplete
      ? "done"
      : pending
        ? "current"
        : "skipped";
  return {
    title: "Group agreement",
    tally: `${view.agreedCount}/${view.memberTotal}`,
    state,
    tag: declined
      ? stepTag("danger", "Declined")
      : entry.memberConsentComplete
        ? stepTag("success", "Done")
        : pending
          ? stepTag("neutral", "Waiting")
          : stepTag("muted", "Not reached"),
    body:
      view.members.length > 0 ? (
        <ul className="space-y-0.5">
          {view.members.map((member) => (
            <li key={member.userId}>{memberWord(member, pending)}</li>
          ))}
        </ul>
      ) : (
        "No members on this group."
      )
  };
}

function approvalStep(view: RequestView): Step {
  const { entry } = view;
  const pending = entry.status === "PENDING";
  const ready = entry.producerGranted || entry.memberConsentComplete;
  const denied = view.votes.some((vote) => !vote.approved);
  const state: StepState =
    entry.status === "APPROVED" ? "done" : denied ? "blocked" : pending ? (ready ? "current" : "upcoming") : "skipped";
  const tag =
    state === "done"
      ? stepTag("success", "Done")
      : state === "blocked"
        ? stepTag("danger", "Denied")
        : state === "current"
          ? stepTag("neutral", "Waiting")
          : undefined;
  const empty = !pending
    ? "No votes."
    : !ready
      ? "Opens after every member agrees."
      : entry.producerGranted
        ? "Waiting for a second exec."
        : "Waiting for producers.";
  return {
    title: entry.producerGranted ? "Exec approvals" : "Producer approvals",
    tally: `${view.approvedCount}/${entry.approvalsRequired}`,
    state,
    tag,
    body:
      view.votes.length > 0 ? (
        <ul className="space-y-0.5">
          {view.votes.map((vote) => (
            <li key={vote.userId}>
              <Mark label={vote.label} you={vote.you} tone={vote.approved ? "ok" : "no"} word={vote.approved ? "Approved" : "Denied"} />
              {!vote.approved && vote.reason ? (
                <p className="flex items-start gap-1.5 pb-1 text-[13px] leading-snug text-danger">
                  <AlertCircle aria-hidden className="mt-px h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    Denied by {vote.label}: &ldquo;{vote.reason}&rdquo;
                  </span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        empty
      )
  };
}

function RequestFacts({ view }: { view: RequestView }) {
  const { entry } = view;
  const directGrant = entry.producerGranted && !view.filedByMember;
  return (
    <KeyValueList
      labelWidth="7.5rem"
      items={[
        {
          label: directGrant ? "Granted by" : "Requested by",
          value: (
            <>
              {view.requesterLabel}
              <time dateTime={entry.createdAt} className="text-muted-foreground">
                {" "}
                · {shortDate(entry.createdAt)}
              </time>
            </>
          )
        },
        {
          // Student requests list every member under Sign-off; exec grants skip that step.
          label: "Members",
          hidden: !entry.producerGranted,
          value:
            view.members.length > 0
              ? view.members.map((member) => (member.you ? `${member.label} (you)` : member.label)).join(", ")
              : "—"
        },
        { label: "Asked for", value: `+${daysLabel(entry.requestedDays)}`, hidden: directGrant },
        {
          label: "Granted",
          value: `+${daysLabel(view.terms.grantedDays)} → ${grantedNames(view)}`,
          hidden: !view.termsSet
        },
        {
          label: "Decided",
          value: entry.decidedAt ? <time dateTime={entry.decidedAt}>{shortDate(entry.decidedAt)}</time> : null,
          hidden: entry.status === "PENDING" || !entry.decidedAt
        }
      ]}
    >
      <KeyValueRow
        layout="stacked"
        label="Reason"
        value={
          entry.reason ? (
            <q className="block max-w-prose text-[var(--ink-text)]">{entry.reason}</q>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
    </KeyValueList>
  );
}

/** The open row's body: Request facts on the left, Sign-off steps on the right, then the actions. */
export function RequestDetail({ view, panelId, labelledBy, actions }: {
  view: RequestView;
  panelId: string;
  labelledBy: string;
  actions: RequestActions;
}) {
  return (
    <div id={panelId} role="region" aria-labelledby={labelledBy} className="border-t border-border px-4 py-4 md:py-5">
      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <section className="min-w-0 space-y-2">
          <SectionLabel as="h2">Request</SectionLabel>
          <RequestFacts view={view} />
        </section>
        <section className="min-w-0 space-y-2">
          <SectionLabel as="h2">Sign-off</SectionLabel>
          <StepList steps={[agreementStep(view), approvalStep(view)]} />
        </section>
      </div>
      <RequestActionArea view={view} actions={actions} />
    </div>
  );
}
