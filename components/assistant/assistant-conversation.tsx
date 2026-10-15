"use client";

import type { RefObject } from "react";
import { Check } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { ApprovalCard, PlaceCard } from "@/components/assistant/assistant-cards";
import {
  AUDIENCE_INTRO,
  MUTATE_INTRO,
  startersFor,
  type ActionState,
  type ChatMessage,
  type PlaceState
} from "@/components/assistant/assistant-stream";
import { TrySuggestions } from "@/components/assistant/try-suggestions";
import { parseAssistantReply, splitInlineBold } from "@/src/lib/assistant-format";
import type { AssistantAudience } from "@/src/lib/assistant-access";
import type { AssistantPlacePreview } from "@/src/lib/assistant-places";
import { cn } from "@/src/lib/utils";

/**
 * The Assistant tab's scroller. Everything sits right above the composer: the welcome and Try
 * suggestions when empty, otherwise the turns. Replies are unboxed text at full column width, so
 * reply text and the cards under it share both edges. Turns are a log (new replies are read
 * out); progress is read out through one status line that is always there.
 */
export function AssistantConversation({
  scrollRef,
  messages,
  busy,
  statusSteps,
  error,
  actionState,
  actionNote,
  placeState,
  audience,
  canMutate,
  touch,
  onPickStarter,
  onApprove,
  onDismissAction,
  onGoToPlace,
  onDismissPlace
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  busy: boolean;
  statusSteps: string[];
  error: string | null;
  actionState: Record<string, ActionState>;
  actionNote: Record<string, string>;
  placeState: Record<string, PlaceState>;
  audience: AssistantAudience;
  canMutate: boolean;
  touch: boolean;
  onPickStarter: (starter: string) => void;
  onApprove: (token: string) => void;
  onDismissAction: (token: string) => void;
  onGoToPlace: (place: AssistantPlacePreview) => void;
  onDismissPlace: (id: string) => void;
}) {
  const empty = messages.length === 0 && !busy;
  const progress = statusLines(statusSteps);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <p role="status" className="sr-only">
        {busy ? `${progress[progress.length - 1]}…` : ""}
      </p>
      <div className="flex min-h-full flex-col justify-end px-4 py-4">
        {empty ? (
          <Welcome audience={audience} canMutate={canMutate} touch={touch} onPickStarter={onPickStarter} />
        ) : (
          <div className="space-y-5">
            <div role="log" aria-label="Conversation" className="space-y-5">
              {messages.map((message) => (
                <div key={message.id} className="space-y-2">
                  {message.role === "user" ? (
                    <div className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-md bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground">
                        <span className="sr-only">You: </span>
                        {message.content}
                      </p>
                    </div>
                  ) : (
                    <div className="break-words text-sm leading-relaxed text-foreground">
                      <span className="sr-only">Assistant: </span>
                      <AssistantRichText text={message.content} />
                    </div>
                  )}
                  {message.proposals?.map((proposal) => (
                    <ApprovalCard
                      key={proposal.token}
                      proposal={proposal}
                      state={actionState[proposal.token] ?? "pending"}
                      note={actionNote[proposal.token]}
                      onApprove={() => onApprove(proposal.token)}
                      onDismiss={() => onDismissAction(proposal.token)}
                      touch={touch}
                    />
                  ))}
                  {message.places?.map((place) => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      state={placeState[place.id] ?? "pending"}
                      onGo={() => onGoToPlace(place)}
                      onDismiss={() => onDismissPlace(place.id)}
                      touch={touch}
                    />
                  ))}
                </div>
              ))}
            </div>
            {busy ? <Progress lines={progress} /> : null}
            {error ? <ErrorAlert message={error} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Welcome({
  audience,
  canMutate,
  touch,
  onPickStarter
}: {
  audience: AssistantAudience;
  canMutate: boolean;
  touch: boolean;
  onPickStarter: (starter: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold leading-tight text-foreground">
          <span aria-hidden className="text-2xl leading-none text-brand-green">
            ✱
          </span>
          Ask Portal
        </h2>
        <div className="space-y-2 text-sm leading-relaxed text-[var(--ink-text)]">
          <p>{AUDIENCE_INTRO[audience]}</p>
          {canMutate ? <p>{MUTATE_INTRO}</p> : null}
        </div>
      </div>
      <TrySuggestions starters={startersFor(audience, canMutate)} onPick={onPickStarter} touch={touch} />
    </div>
  );
}

function statusLines(steps: string[]) {
  return steps.length > 0 ? steps : ["Looking that up"];
}

/**
 * Plain progress lines while it works; finished steps get a check, the current one dots. Hidden
 * from screen readers, which hear the status line instead.
 */
function Progress({ lines }: { lines: string[] }) {
  return (
    <div aria-hidden className="space-y-1.5 text-[13px]">
      {lines.map((label, index) => {
        const current = index === lines.length - 1;
        return (
          <div
            key={`${label}-${index}`}
            className={cn("flex items-center gap-2", current ? "text-[var(--ink-text)]" : "text-muted-foreground")}
          >
            <span className="grid w-5 shrink-0 place-items-center">
              {current ? <TypingDots /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            </span>
            <span>{current ? `${label}…` : label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert tone="danger" compact>
      <span className="whitespace-pre-wrap break-words">{message}</span>
    </Alert>
  );
}

function AssistantRichText({ text }: { text: string }) {
  const blocks = parseAssistantReply(text);
  if (blocks.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, index) =>
        block.type === "ul" ? (
          <ul key={index} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{renderInline(block.text)}</p>
        )
      )}
    </div>
  );
}

function renderInline(text: string) {
  return splitInlineBold(text).map((part, index) =>
    part.bold ? (
      <strong key={index} className="font-semibold">
        {part.text}
      </strong>
    ) : (
      <span key={index}>{part.text}</span>
    )
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-pulse motion-safe:[animation-delay:-0.3s]" />
      <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-pulse motion-safe:[animation-delay:-0.15s]" />
      <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-pulse" />
    </span>
  );
}
