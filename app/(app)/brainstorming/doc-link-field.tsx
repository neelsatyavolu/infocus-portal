"use client";

import { useId } from "react";
import { Check, ExternalLink } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/lib/utils";
import { docState, isDocDirty, type DocState } from "./brainstorm-view";

const STATE_TAG: Record<DocState, { tone: "success" | "warning" | "muted"; label: string }> = {
  linked: { tone: "success", label: "Linked" },
  missing: { tone: "muted", label: "Not linked" },
  dirty: { tone: "warning", label: "Unsaved changes" }
};

/** Phones get 40px controls (and 16px text, so iOS doesn't zoom); 36px from md. */
const CONTROL = "h-10 md:h-9";

/**
 * The brainstorm Google Doc link: a heading-level label with the link's state, the field, then
 * Open and Save link in one row. Enter saves. Save link is the filled button only while there
 * is something to save (emptying a saved link turns it into Remove link); otherwise it stays an
 * outline button that saves the link as it is.
 */
export function DocLinkField({
  saved,
  draft,
  canEdit,
  saving,
  error,
  onDraftChange,
  onSave
}: {
  /** The saved brainstormDocUrl. */
  saved: string;
  /** What the person typed, or undefined when they haven't edited it. */
  draft: string | undefined;
  canEdit: boolean;
  saving: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  const inputId = `${useId()}-doc`;
  const stateId = `${inputId}-state`;
  const errorId = `${inputId}-error`;
  const value = draft ?? saved;
  const dirty = isDocDirty(saved, draft);
  const clearing = dirty && !value.trim() && Boolean(saved.trim());
  const tag = STATE_TAG[docState(saved, draft)];
  const hasOpen = Boolean(saved);

  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canEdit && !saving) onSave();
      }}
    >
      <div className="flex min-h-6 min-w-0 items-center gap-2">
        <h3 className="shrink-0">
          <label
            htmlFor={inputId}
            className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground"
          >
            Brainstorm Google Doc
          </label>
        </h3>
        <span className="flex-1" />
        <span id={stateId} className="flex shrink-0 items-center">
          <StatusTag size="sm" tone={tag.tone} icon={tag.tone === "success" ? Check : undefined}>
            {tag.label}
          </StatusTag>
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${stateId} ${errorId}` : stateId}
          value={value}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="https://docs.google.com/document/d/…"
          disabled={!canEdit}
          className={cn(CONTROL, "min-w-0 flex-1")}
        />
        {hasOpen || canEdit ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            {hasOpen ? (
              <a
                href={saved}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), CONTROL, !canEdit && "col-span-2")}
              >
                <ExternalLink aria-hidden />
                Open
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            {canEdit ? (
              <Button
                type="submit"
                variant={!dirty ? "outline" : clearing ? "destructive-quiet" : "default"}
                disabled={saving}
                className={cn(CONTROL, !hasOpen && "col-span-2")}
              >
                {saving ? <Spinner /> : null}
                {clearing ? "Remove link" : "Save link"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <InlineError id={errorId}>{error}</InlineError> : null}
    </form>
  );
}
