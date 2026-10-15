"use client";

import { Fragment, type RefObject } from "react";
import { ChevronLeft } from "lucide-react";
import { ChatComposer } from "@/components/assistant/chat-composer";
import { ChatTile } from "@/components/assistant/chat-tile";
import { formatClock, formatStamp, groupThread, showsTimeAfter } from "@/components/assistant/chat-time";
import type { ThreadPayload } from "@/components/assistant/hub-chat-client";
import { Alert } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * One conversation: a thread bar (Back, tile, members or person over package or "Direct"),
 * messages grouped by day and into runs per author (one name per run; a time under each
 * message, shared by messages sent in the same minute; the full stamp for screen readers and
 * on hover), and the shared composer.
 */
export function ThreadView({
  thread,
  scrollRef,
  inputRef,
  titleRef,
  input,
  onInput,
  onSend,
  busy,
  error,
  onBack,
  keyboardOpen,
  touch,
  sheet
}: {
  thread: ThreadPayload;
  scrollRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Focus target on touch screens, where focusing the composer would raise the keyboard. */
  titleRef: RefObject<HTMLHeadingElement | null>;
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  keyboardOpen: boolean;
  touch: boolean;
  /** Phone sheet: pad the composer for the home indicator while the keyboard is down. */
  sheet: boolean;
}) {
  const showNames = thread.chat.kind === "GROUP";
  const days = groupThread(thread.messages, thread.me.id);
  const empty = thread.messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex shrink-0 items-center gap-2 border-b border-border px-4", touch ? "h-14" : "h-12")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to messages"
          className={cn("-ml-2 shrink-0 text-muted-foreground", touch ? "h-11 w-11" : "h-9 w-9")}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <ChatTile kind={thread.chat.kind} name={thread.chat.title} />
        <div className="ml-1 min-w-0">
          <h2 ref={titleRef} tabIndex={-1} className="truncate text-sm font-semibold leading-tight text-foreground outline-none">
            {thread.chat.title}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{thread.chat.subtitle}</p>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn("flex min-h-full flex-col px-4 py-4", empty ? "justify-center" : "justify-end")}>
          {empty ? (
            <p className="text-center text-sm text-muted-foreground">No messages yet. Say hi.</p>
          ) : (
            <div role="log" aria-label="Messages" className="space-y-4">
              {days.map((day) => (
                <section key={day.key} aria-label={day.label} className="space-y-3">
                  <div className="flex items-center gap-3" aria-hidden>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
                      {day.label}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  {day.runs.map((run) => (
                    <div key={run.key} className={cn("flex flex-col gap-1", run.mine ? "items-end" : "items-start")}>
                      {showNames && !run.mine ? (
                        <p className="text-xs font-medium text-muted-foreground">{run.messages[0].author.name}</p>
                      ) : null}
                      {run.messages.map((message, index) => (
                        <Fragment key={message.id}>
                          <div
                            title={formatStamp(message.createdAt)}
                            className={cn(
                              "max-w-[85%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm leading-relaxed",
                              run.mine ? "bg-primary text-primary-foreground" : "bg-[var(--ink-3)] text-foreground"
                            )}
                          >
                            {message.body}
                            <time dateTime={message.createdAt} className="sr-only">
                              {` ${formatStamp(message.createdAt)}`}
                            </time>
                          </div>
                          {showsTimeAfter(run.messages, index) ? (
                            <p aria-hidden className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">
                              {formatClock(message.createdAt)}
                            </p>
                          ) : null}
                        </Fragment>
                      ))}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="shrink-0 px-4 pb-1 pt-2">
          <Alert tone="danger" compact>
            {error}
          </Alert>
        </div>
      ) : null}

      <ChatComposer
        ref={inputRef}
        value={input}
        onChange={onInput}
        onSubmit={onSend}
        busy={busy}
        placeholder="Message…"
        ariaLabel={`Message ${thread.chat.kind === "GROUP" ? thread.chat.subtitle : thread.chat.title}`}
        touch={touch}
        safeAreaBottom={sheet && !keyboardOpen}
      />
    </div>
  );
}
