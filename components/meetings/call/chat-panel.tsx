"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { MEETING_CHAT_MAX_CHARS } from "@/src/lib/meetings/client/chat-crypto";
import { pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";
import { SidePanel } from "./side-panel";
import type { ChatEntry } from "./use-meeting-call";

export function ChatPanel({
  messages,
  onSend,
  onClose,
  mobile
}: {
  messages: ChatEntry[];
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
  mobile: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (await onSend(text)) setDraft("");
      else toast.error("Couldn't send. Check your connection and try again.");
    } catch {
      toast.error("Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <SidePanel
      title="Chat"
      onClose={onClose}
      mobile={mobile}
      footer={
        <form onSubmit={submit} className="flex items-end gap-2">
          <label htmlFor="meeting-chat-input" className="sr-only">
            Message everyone
          </label>
          <textarea
            id="meeting-chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MEETING_CHAT_MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(e);
              }
            }}
            rows={1}
            placeholder="Message everyone"
            className="min-h-11 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      }
    >
      <p className="mx-4 mt-4 flex items-center gap-1.5 rounded-md bg-[var(--ink-3)] px-3 py-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Messages are encrypted and disappear when the call ends.
      </p>
      <ol className="space-y-4 p-4" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className="flex flex-col items-start gap-1">
            <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{m.own ? "You" : m.name}</span>
              <span className="font-mono tabular-nums">{pacificTimeLabel(new Date(m.at))}</span>
            </div>
            <p
              className={cn(
                "max-w-full whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm",
                m.text === null ? "italic text-muted-foreground outline outline-1 outline-[var(--ink-4)]" : "bg-[var(--ink-3)] text-foreground"
              )}
            >
              {m.text ?? (m.problem === "unverified" ? "Couldn't verify this message" : "Message from before you joined")}
            </p>
          </li>
        ))}
        {messages.length === 0 ? <li className="text-sm text-muted-foreground">No messages yet.</li> : null}
      </ol>
      <div ref={endRef} />
    </SidePanel>
  );
}
