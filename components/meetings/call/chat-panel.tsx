"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock, MessageSquare, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/kit/empty-state";
import { MEETING_CHAT_MAX_CHARS } from "@/src/lib/meetings/client/chat-crypto";
import { pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";
import { startsChatGroup } from "./chat-groups";
import { useChatDraft } from "./panel-tabs";
import { SidePanel } from "./side-panel";
import type { ChatEntry } from "./use-meeting-call";

const ENCRYPTED_NOTE = "Messages are encrypted and disappear when the call ends.";

/**
 * One message. A burst from the same sender in the same minute shows the name and time once;
 * the later messages still carry both for screen readers, so nothing is lost.
 */
function Message({ message, header }: { message: ChatEntry; header: boolean }) {
  const unreadable = message.text === null;
  const sender = message.own ? "You" : message.name;
  const time = pacificTimeLabel(new Date(message.at));
  return (
    <li className={cn("flex flex-col items-start gap-1", header ? "pt-3 first:pt-0" : "pt-1")}>
      {header ? (
        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-[var(--ink-text)]">{sender}</span>
          <span className="font-mono tabular-nums">{time}</span>
        </div>
      ) : (
        <span className="sr-only">{`${sender}, ${time}:`}</span>
      )}
      <p
        className={cn(
          "max-w-full whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm",
          unreadable
            ? "flex items-center gap-1.5 text-muted-foreground outline outline-1 outline-[var(--ink-4)]"
            : message.own
              ? "bg-[var(--brand-green)]/10 text-foreground"
              : "bg-[var(--ink-3)] text-foreground"
        )}
      >
        {unreadable ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        {message.text ?? (message.problem === "unverified" ? "Couldn't verify this message" : "Message from before you joined")}
      </p>
    </li>
  );
}

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
  const [draft, setDraft] = useChatDraft();
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
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit(e);
              }
            }}
            rows={1}
            placeholder="Message everyone"
            className="min-h-11 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-[var(--brand-fill-hover)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink-2)]"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      }
    >
      {messages.length > 0 ? (
        <p className="flex items-center gap-1.5 px-4 pt-3 text-xs text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          {ENCRYPTED_NOTE}
        </p>
      ) : (
        <EmptyState icon={MessageSquare} title="No messages yet" description={ENCRYPTED_NOTE} className="py-12" />
      )}
      <ol className="p-4 empty:p-0" aria-live="polite" aria-label="Messages">
        {messages.map((m, i) => (
          <Message key={m.id} message={m} header={startsChatGroup(messages[i - 1], m)} />
        ))}
      </ol>
      <div ref={endRef} />
    </SidePanel>
  );
}
