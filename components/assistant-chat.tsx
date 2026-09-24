"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, Send, Sparkles, X } from "lucide-react";
import { parseAssistantReply, splitInlineBold } from "@/src/lib/assistant-format";
import type { AssistantPlacePreview } from "@/src/lib/assistant-places";
import { cn } from "@/src/lib/utils";

// Only rendered once the panel is open, so keep it out of the shell bundle every page loads.
const HubMessages = dynamic(() => import("@/components/hub-messages").then((m) => m.HubMessages), {
  ssr: false
});

type ActionPreview = {
  token: string;
  kind: string;
  title: string;
  details: Array<{ label: string; value: string }>;
};

type ActionState = "pending" | "running" | "done" | "dismissed" | "error";

type PlaceState = "pending" | "dismissed" | "opened";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  proposals?: ActionPreview[];
  places?: AssistantPlacePreview[];
};

const NEAR_BOTTOM_PX = 100;

type AssistantAudience = "member" | "associate" | "executive" | "admin";

const MEMBER_STARTERS = [
  "How do I submit brainstorming?",
  "When is A-roll due?",
  "How do I request an extension?",
  "How do I check out equipment?",
  "Where is Brainstorming?",
  "What's the difference between The Cycle and Package Cycle?"
];

const ASSOCIATE_STARTERS = [
  "How do I send a package to the publishing queue?",
  "Who can approve stage 2?",
  "What's the difference between Groups and Package Cycle?",
  "Who can see the publishing queue?",
  "How do I check out equipment?",
  "Where is Groups?",
  "What packages am I producing?",
  "What comments are on my packages?",
  "When is participation scored?"
];

const EXECUTIVE_STARTERS = [
  "How do I send a package to the publishing queue?",
  "Who can approve stage 2?",
  "How do I add someone in Admin?",
  "What's the difference between Groups and Package Cycle?",
  "How do check-in grades post?",
  "Who can see the publishing queue?",
  "Where is Groups?",
  "What packages am I producing?",
  "What comments are on my packages?",
  "How do Final Cut scores work?"
];

const MUTATE_STARTERS = [
  "Add a package to cycle 1 called Lunch prices with Ada and Lo",
  "Make Sam an associate producer",
  "Send Lunch prices to the publishing queue",
  "What's Ada's grade?",
  "Set Ada's nickname to Ada",
  "What packages am I producing?",
  "What stage is Lunch prices on?",
  "Set cycle 1 quality for Lunch prices to 45",
  "How do I send a package to the publishing queue?",
  "Who can approve stage 2?",
  "Where is Groups?"
];

const TRY_PAGE_SIZE = 3;
const TRY_ROTATE_MS = 5000;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function useMobilePanelBox(open: boolean) {
  const [box, setBox] = useState<{ top: number; height: number; keyboard: boolean } | null>(null);

  useEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }

    const media = window.matchMedia("(max-width: 639px)");
    const update = () => {
      if (!media.matches) {
        setBox(null);
        return;
      }
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      setBox({
        top,
        height,
        keyboard: window.innerHeight - height > 80
      });
    };

    update();
    media.addEventListener("change", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener("change", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return box;
}

function startersFor(audience: AssistantAudience, canMutate: boolean) {
  if (canMutate) {
    return MUTATE_STARTERS;
  }
  if (audience === "member") {
    return MEMBER_STARTERS;
  }
  if (audience === "associate") {
    return ASSOCIATE_STARTERS;
  }
  return EXECUTIVE_STARTERS;
}

export function AssistantChat({
  canMutate = false,
  audience = "member"
}: {
  canMutate?: boolean;
  audience?: AssistantAudience;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"assistant" | "messages">("assistant");
  const [unread, setUnread] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusSteps, setStatusSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});
  const [actionNote, setActionNote] = useState<Record<string, string>>({});
  const [placeState, setPlaceState] = useState<Record<string, PlaceState>>({});
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pinnedRef = useRef(true);
  const mobileBox = useMobilePanelBox(open);
  // While Messages is on screen its inbox poll already reports the unread count.
  const messagesPollingRef = useRef(false);

  useEffect(() => {
    messagesPollingRef.current = open && mode === "messages";
  }, [open, mode]);

  useEffect(() => {
    if (open && mode === "assistant" && window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const response = await fetch("/api/hub-chat/unread");
        const payload = (await response.json()) as { data?: { unreadCount?: number } };
        if (!cancelled && response.ok) {
          setUnread(payload.data?.unreadCount ?? 0);
        }
      } catch {
        // Badge stays at the last known count.
      }
    }
    // Background tabs stop polling; the badge refreshes as soon as the tab is back.
    const tickIfVisible = () => {
      if (document.visibilityState === "visible" && !messagesPollingRef.current) {
        void tick();
      }
    };
    tickIfVisible();
    const interval = window.setInterval(tickIfVisible, 15_000);
    document.addEventListener("visibilitychange", tickIfVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tickIfVisible);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) {
      return;
    }
    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    const onScroll = () => {
      pinnedRef.current = atBottom();
    };
    const stick = () => {
      if (pinnedRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    };
    const observer = new MutationObserver(stick);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    stick();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  function autosize() {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) {
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { id: uid(), role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setStatusSteps([]);
    setError(null);
    pinnedRef.current = true;
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    });

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "Assistant is unavailable.");
      }

      const payload = await readAssistantStream(response, (label) => {
        setStatusSteps((current) => (current[current.length - 1] === label ? current : [...current, label]));
      });
      const reply = payload.reply?.trim();
      if (!reply) {
        throw new Error("Assistant returned an empty reply.");
      }

      setMessages([
        ...nextMessages,
        {
          id: uid(),
          role: "assistant",
          content: reply,
          sources: payload.sources,
          proposals: payload.proposals,
          places: payload.places
        }
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assistant is unavailable.");
    } finally {
      setBusy(false);
      setStatusSteps([]);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setActionState({});
    setActionNote({});
    setPlaceState({});
    inputRef.current?.focus();
  }

  function goToPlace(place: AssistantPlacePreview) {
    if (!isSafePlaceHref(place.href)) {
      return;
    }
    setPlaceState((current) => ({ ...current, [place.id]: "opened" }));
    if (place.external && place.newTab) {
      window.open(place.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (place.external) {
      window.location.assign(place.href);
      return;
    }
    setOpen(false);
    router.push(place.href as never);
  }

  async function decideAction(token: string, approve: boolean) {
    if (!approve) {
      setActionState((current) => ({ ...current, [token]: "dismissed" }));
      return;
    }
    setActionState((current) => ({ ...current, [token]: "running" }));
    try {
      const response = await fetch("/api/assistant/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const payload = (await response.json()) as {
        data?: { message?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not make that change.");
      }
      setActionState((current) => ({ ...current, [token]: "done" }));
      setActionNote((current) => ({ ...current, [token]: payload.data?.message ?? "Done." }));
    } catch (caught) {
      setActionState((current) => ({ ...current, [token]: "error" }));
      setActionNote((current) => ({
        ...current,
        [token]: caught instanceof Error ? caught.message : "Could not make that change."
      }));
    }
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={unread > 0 ? `Open Portal assistant, ${unread} unread messages` : "Open Portal assistant"}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-50 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/30 transition hover:bg-[var(--brand-green-deep)] active:scale-95"
        >
          <span className="text-2xl leading-none" aria-hidden>
            ✱
          </span>
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      ) : null}

      {open ? (
        <section
          className={cn(
            "fixed z-[70] flex flex-col overflow-hidden border-border bg-background shadow-2xl shadow-black/40",
            "inset-0 rounded-none border-0",
            "sm:inset-auto sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:right-[max(1.25rem,env(safe-area-inset-right))] sm:h-[min(682px,calc(100dvh-2rem))] sm:w-[min(462px,calc(100vw-2rem))] sm:rounded-xl sm:border"
          )}
          style={mobileBox ? { top: mobileBox.top, height: mobileBox.height, bottom: "auto" } : undefined}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="hidden h-4 w-4 shrink-0 text-primary sm:block" aria-hidden />
              <div className="flex rounded-md bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("assistant")}
                  className={cn(
                    "min-h-9 rounded px-3 py-1 text-[13px] font-medium sm:min-h-0 sm:px-2 sm:text-[12px]",
                    mode === "assistant" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Assistant
                </button>
                <button
                  type="button"
                  onClick={() => setMode("messages")}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1 rounded px-3 py-1 text-[13px] font-medium sm:min-h-0 sm:px-2 sm:text-[12px]",
                    mode === "messages" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Messages
                  {unread > 0 ? (
                    <span className="grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-destructive-foreground">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {mode === "assistant" && messages.length > 0 ? (
                <button
                  type="button"
                  onClick={clearChat}
                  className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  title="Clear conversation"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground sm:h-7 sm:w-7"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
            </div>
          </header>

          <div className={cn("flex min-h-0 flex-1 flex-col", mode !== "messages" && "hidden")}>
            <HubMessages
              visible={mode === "messages"}
              onUnread={setUnread}
              keyboardOpen={Boolean(mobileBox?.keyboard)}
            />
          </div>

          <div
            ref={scrollRef}
            className={cn(
              "min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3 text-[13.5px] leading-relaxed",
              mode !== "assistant" && "hidden"
            )}
          >
            {messages.length === 0 && !busy ? (
              <div className="space-y-2.5">
                <div className="space-y-2 text-foreground">
                  {audience === "member" ? (
                    <p>
                      I&rsquo;m Portal Assistant. I can explain how your cycle tabs, grades, calendar, and the rest of Portal
                      work, and look up packages you&rsquo;re on.
                    </p>
                  ) : audience === "associate" ? (
                    <p>
                      I&rsquo;m Portal Assistant. I can explain Groups, calendar, the publishing queue, and the rest of Portal,
                      and look up the packages you produce. I cannot look up grades.
                    </p>
                  ) : (
                    <p>
                      I&rsquo;m Portal Assistant. I can explain how Groups, grades, calendar, the publishing queue, Admin,
                      and the rest of Portal work, look up the packages you produce, and check a package&rsquo;s current
                      stage and status.
                    </p>
                  )}
                  {canMutate ? (
                    <p>
                      I can also look up grades and propose changes — add packages, people, nicknames, or cycle dates.
                      I&rsquo;ll show a card for you to approve first.
                    </p>
                  ) : null}
                </div>
                <RotatingTryExamples
                  starters={startersFor(audience, canMutate)}
                  onPick={(starter) => void send(starter)}
                />
              </div>
            ) : null}

            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <article className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-[13.5px] leading-relaxed",
                      message.role === "user"
                        ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                        : "border border-border bg-card text-foreground"
                    )}
                  >
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <AssistantRichText text={message.content} />
                    )}
                  </div>
                </article>
                {message.proposals?.map((proposal) => (
                  <ActionCard
                    key={proposal.token}
                    proposal={proposal}
                    state={actionState[proposal.token] ?? "pending"}
                    note={actionNote[proposal.token]}
                    onApprove={() => void decideAction(proposal.token, true)}
                    onDismiss={() => void decideAction(proposal.token, false)}
                  />
                ))}
                {message.places?.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    state={placeState[place.id] ?? "pending"}
                    onGo={() => goToPlace(place)}
                    onDismiss={() => setPlaceState((current) => ({ ...current, [place.id]: "dismissed" }))}
                  />
                ))}
              </div>
            ))}

            {busy ? (
              <div className="space-y-1 py-0.5" aria-live="polite" aria-label="Assistant progress">
                {(statusSteps.length > 0 ? statusSteps : ["Looking that up"]).map((label, index, list) => {
                  const current = index === list.length - 1;
                  return (
                    <div
                      key={`${label}-${index}`}
                      className={cn(
                        "flex items-center gap-2 text-[12px]",
                        current ? "text-muted-foreground" : "text-muted-foreground/55"
                      )}
                    >
                      {current ? <TypingDots /> : <Check className="h-3 w-3 shrink-0" aria-hidden />}
                      <span>{current ? `${label}…` : label}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {error ? (
              <div className="mr-6 whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <form
            onSubmit={onSubmit}
            className={cn(
              "border-t border-border bg-background p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-2.5",
              mobileBox?.keyboard && "pb-2.5",
              mode !== "assistant" && "hidden"
            )}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  requestAnimationFrame(autosize);
                }}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask anything about Portal…"
                disabled={busy}
                className="max-h-32 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 sm:text-[13.5px]"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-[38px]"
              >
                {busy ? "…" : "Send"}
                {busy ? null : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}

async function readAssistantStream(
  response: Response,
  onTool: (label: string) => void
): Promise<{
  reply?: string;
  sources?: string[];
  proposals?: ActionPreview[];
  places?: AssistantPlacePreview[];
}> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson") && !contentType.includes("jsonl")) {
    const payload = (await response.json()) as {
      data?: {
        reply?: string;
        sources?: string[];
        proposals?: ActionPreview[];
        places?: AssistantPlacePreview[];
      };
      error?: { message?: string };
    };
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }
    return payload.data ?? {};
  }

  if (!response.body) {
    throw new Error("Assistant is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneData: {
    reply?: string;
    sources?: string[];
    proposals?: ActionPreview[];
    places?: AssistantPlacePreview[];
  } | null = null;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const event = JSON.parse(trimmed) as {
      type?: string;
      label?: string;
      message?: string;
      data?: {
        reply?: string;
        sources?: string[];
        proposals?: ActionPreview[];
        places?: AssistantPlacePreview[];
      };
    };
    if (event.type === "tool" && event.label) {
      onTool(event.label);
    } else if (event.type === "done") {
      doneData = event.data ?? {};
    } else if (event.type === "error") {
      throw new Error(event.message ?? "Assistant is unavailable.");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      consumeLine(line);
    }
    if (done) {
      consumeLine(buffer);
      break;
    }
  }

  return doneData ?? {};
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
          <ul key={index} className="list-disc space-y-1 pl-4">
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

function ActionCard({
  proposal,
  state,
  note,
  onApprove,
  onDismiss
}: {
  proposal: ActionPreview;
  state: ActionState;
  note?: string;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  if (state === "dismissed") {
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
        Skipped: {proposal.title}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Needs approval</p>
        <p className="mt-0.5 text-[13.5px] font-medium text-foreground">{proposal.title}</p>
      </header>
      <dl className="space-y-1.5 px-3 py-2.5">
        {proposal.details.map((detail) => (
          <div key={detail.label} className="grid grid-cols-[92px_1fr] gap-2 text-[12.5px]">
            <dt className="text-muted-foreground">{detail.label}</dt>
            <dd className="text-foreground">{detail.value}</dd>
          </div>
        ))}
      </dl>
      {state === "done" ? (
        <p className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[12.5px] text-primary">
          <Check className="h-3.5 w-3.5" />
          {note || "Done."}
        </p>
      ) : state === "error" ? (
        <p className="border-t border-border px-3 py-2 text-[12.5px] text-destructive">{note}</p>
      ) : (
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={state === "running"}
            className="rounded-md px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Don&rsquo;t
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={state === "running"}
            className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {state === "running" ? "Saving…" : "Approve"}
          </button>
        </div>
      )}
    </section>
  );
}

const ALLOWED_PLACE_HOSTS = new Set([
  "drive.infocuspaly.com",
  "teleprompter.infocuspaly.com",
  "equipment.infocuspaly.com"
]);

function isSafePlaceHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")) {
    return true;
  }
  try {
    const url = new URL(href);
    return url.protocol === "https:" && ALLOWED_PLACE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function PlaceCard({
  place,
  state,
  onGo,
  onDismiss
}: {
  place: AssistantPlacePreview;
  state: PlaceState;
  onGo: () => void;
  onDismiss: () => void;
}) {
  if (state === "dismissed") {
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
        Skipped: {place.title}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          I can show where that is
        </p>
        <p className="mt-0.5 text-[13.5px] font-medium text-foreground">{place.title}</p>
      </header>
      <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">{place.hint}</p>
      {state === "opened" ? (
        <p className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[12.5px] text-primary">
          <Check className="h-3.5 w-3.5" />
          Opened.
        </p>
      ) : (
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md px-2.5 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onGo}
            className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            Take me there
          </button>
        </div>
      )}
    </section>
  );
}

function RotatingTryExamples({
  starters,
  onPick
}: {
  starters: readonly string[];
  onPick: (starter: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [opaque, setOpaque] = useState(true);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (starters.length <= TRY_PAGE_SIZE || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let fadeTimer: number | undefined;
    const interval = window.setInterval(() => {
      if (pausedRef.current) {
        return;
      }
      setOpaque(false);
      fadeTimer = window.setTimeout(() => {
        setOffset((current) => (current + TRY_PAGE_SIZE) % starters.length);
        setOpaque(true);
      }, 180);
    }, TRY_ROTATE_MS);
    return () => {
      window.clearInterval(interval);
      if (fadeTimer !== undefined) {
        window.clearTimeout(fadeTimer);
      }
    };
  }, [starters]);

  const examples = Array.from({ length: Math.min(TRY_PAGE_SIZE, starters.length) }, (_, index) => {
    return starters[(offset + index) % starters.length];
  });

  function pause() {
    pausedRef.current = true;
  }

  function resume() {
    pausedRef.current = false;
  }

  return (
    <div
      className="space-y-1 rounded-md border border-border bg-muted/60 p-2.5 text-[12.5px] text-muted-foreground"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      <p className="text-[12px] font-medium uppercase tracking-wider text-foreground">Try</p>
      <div className={cn("space-y-1 transition-opacity duration-200", opaque ? "opacity-100" : "opacity-0")}>
        {examples.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onPick(starter)}
            onFocus={pause}
            onBlur={resume}
            className="block w-full rounded px-0 py-0.5 text-left hover:text-foreground"
          >
            &ldquo;{starter}&rdquo;
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Thinking">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </span>
  );
}
