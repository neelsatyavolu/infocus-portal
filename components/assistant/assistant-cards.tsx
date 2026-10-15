"use client";

import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Check, ExternalLink } from "lucide-react";
import { KeyValueList } from "@/components/kit/key-value";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import type { AssistantPlacePreview } from "@/src/lib/assistant-places";
import { cn } from "@/src/lib/utils";
import type { ActionPreview, ActionState, PlaceState } from "@/components/assistant/assistant-stream";

const DONE_FALLBACK = "Done.";
const ERROR_FALLBACK = "Could not make that change.";

/**
 * Shared shell for the assistant's cards: a status slot, the title, a body, and a footer that
 * holds only actions or a note. Recessed (page Ink) against the Ink 2 panel, full column width.
 */
function DecisionCard({
  status,
  title,
  children,
  footer
}: {
  status: ReactNode;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <header className="px-4 pt-3">
        <div className="flex min-h-5 flex-wrap items-center gap-2">{status}</div>
        <p className="mt-1.5 text-sm font-medium text-foreground">{title}</p>
      </header>
      <div className="px-4 pb-3 pt-2">{children}</div>
      {footer ? (
        <div className="flex min-h-12 items-center justify-end gap-2 border-t border-border px-4 py-2">{footer}</div>
      ) : null}
    </section>
  );
}

/** A dismissed card collapses to one quiet row. */
function SkippedRow({ title }: { title: string }) {
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-md border border-border px-4 py-2 text-[13px] text-muted-foreground">
      <StatusTag tone="neutral">Skipped</StatusTag>
      <span className="min-w-0 truncate">{title}</span>
    </div>
  );
}

function cardButtonClass(touch: boolean) {
  return touch ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]";
}

/**
 * A change the assistant proposes (super admin and adviser only). Nothing is saved until
 * Approve; Don't only hides the card. The tag carries the state (Saving, Done, Failed); the
 * footer holds the actions, which stay as they are (just disabled) while it saves.
 */
export function ApprovalCard({
  proposal,
  state,
  note,
  onApprove,
  onDismiss,
  touch
}: {
  proposal: ActionPreview;
  state: ActionState;
  note?: string;
  onApprove: () => void;
  onDismiss: () => void;
  touch: boolean;
}) {
  if (state === "dismissed") {
    return <SkippedRow title={proposal.title} />;
  }

  const status =
    state === "running" ? (
      <StatusTag tone="neutral" spinner>
        Saving
      </StatusTag>
    ) : state === "done" ? (
      <StatusTag tone="success" icon={Check}>
        Done
      </StatusTag>
    ) : state === "error" ? (
      <StatusTag tone="danger">Failed</StatusTag>
    ) : (
      <StatusTag tone="warning">Needs approval</StatusTag>
    );

  const buttonClass = cardButtonClass(touch);
  let footer: ReactNode = null;
  if (state === "pending" || state === "running") {
    const running = state === "running";
    footer = (
      <>
        <Button type="button" variant="ghost" onClick={onDismiss} disabled={running} className={buttonClass}>
          Don&rsquo;t
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onApprove}
          disabled={running}
          className={cn(buttonClass, "text-brand-green hover:text-brand-green")}
        >
          <Check aria-hidden />
          Approve
        </Button>
      </>
    );
  } else if (state === "error") {
    footer = (
      <>
        <p role="alert" className="mr-auto flex min-w-0 items-start gap-2 text-[13px] text-danger">
          <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{note || ERROR_FALLBACK}</span>
        </p>
        <Button type="button" variant="ghost" onClick={onDismiss} className={buttonClass}>
          Don&rsquo;t
        </Button>
      </>
    );
  } else if (state === "done" && note && note !== DONE_FALLBACK) {
    footer = <p className="mr-auto min-w-0 break-words text-[13px] text-[var(--ink-text)]">{note}</p>;
  }

  return (
    <DecisionCard status={status} title={proposal.title} footer={footer}>
      <KeyValueList
        dense
        divided={false}
        labelWidth="6rem"
        items={proposal.details.map((detail) => ({ key: detail.label, label: detail.label, value: detail.value }))}
      />
    </DecisionCard>
  );
}

/** "Where is X": a page the asker can open (role-gated on the server). */
export function PlaceCard({
  place,
  state,
  onGo,
  onDismiss,
  touch
}: {
  place: AssistantPlacePreview;
  state: PlaceState;
  onGo: () => void;
  onDismiss: () => void;
  touch: boolean;
}) {
  if (state === "dismissed") {
    return <SkippedRow title={place.title} />;
  }

  const opened = state === "opened";
  const buttonClass = cardButtonClass(touch);
  const GoIcon = place.external && place.newTab ? ExternalLink : ArrowRight;

  return (
    <DecisionCard
      status={
        <>
          <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            I can show where that is
          </span>
          {opened ? (
            <StatusTag tone="success" icon={Check}>
              Opened
            </StatusTag>
          ) : null}
        </>
      }
      title={place.title}
      footer={
        opened ? null : (
          <>
            <Button type="button" variant="ghost" onClick={onDismiss} className={buttonClass}>
              Not now
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onGo}
              className={cn(buttonClass, "text-brand-green hover:text-brand-green")}
            >
              Take me there
              <GoIcon aria-hidden />
            </Button>
          </>
        )
      }
    >
      <p className="text-[13px] leading-snug text-muted-foreground">{place.hint}</p>
    </DecisionCard>
  );
}
