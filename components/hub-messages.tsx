"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronLeft, Send } from "lucide-react";
import { cn } from "@/src/lib/utils";

type Person = { id: string; name: string };

type InboxChat = {
  id: string | null;
  kind: "GROUP" | "DIRECT";
  title: string;
  subtitle: string;
  preview: string | null;
  updatedAt: string | null;
  unreadCount: number;
  packageRowId?: string;
  peer?: Person | null;
};

type InboxPayload = {
  me: Person;
  canStartDirect: boolean;
  unreadCount: number;
  chats: InboxChat[];
  members: Person[];
};

type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  author: Person;
};

type ThreadPayload = {
  me: Person;
  chat: {
    id: string;
    kind: "GROUP" | "DIRECT";
    title: string;
    subtitle: string;
    packageRowId: string | null;
    peer: Person | null;
  };
  messages: ThreadMessage[];
};

const NEAR_BOTTOM_PX = 100;
const INBOX_POLL_MS = 5000;
const THREAD_POLL_MS = 4000;

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Could not load messages.");
  }
  if (!payload.data) {
    throw new Error("Could not load messages.");
  }
  return payload.data;
}

function formatStamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function HubMessages({
  onUnread,
  visible = true,
  keyboardOpen = false
}: {
  onUnread?: (count: number) => void;
  visible?: boolean;
  keyboardOpen?: boolean;
}) {
  const [inbox, setInbox] = useState<InboxPayload | null>(null);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ThreadPayload | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pinnedRef = useRef(true);
  const activeIdRef = useRef<string | null>(null);
  const draftsRef = useRef<Record<string, string>>({});

  const navigationRef = useRef(0);

  async function loadInbox() {
    const data = await readData<InboxPayload>(await fetch("/api/hub-chat"));
    setInbox(data);
    onUnread?.(data.unreadCount);
    return data;
  }

  async function loadThread(chatId: string) {
    const data = await readData<ThreadPayload>(await fetch(`/api/hub-chat/${chatId}`));
    return data;
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const navigation = navigationRef.current;
      try {
        await loadInbox();
        if (cancelled || navigation !== navigationRef.current) {
          return;
        }
        setError(null);
        const chatId = activeIdRef.current;
        if (chatId) {
          const data = await loadThread(chatId);
          if (!cancelled && navigation === navigationRef.current && activeIdRef.current === chatId) {
            setActive(data);
          }
        }
      } catch (caught) {
        if (!cancelled && navigation === navigationRef.current) {
          setError(caught instanceof Error ? caught.message : "Could not load messages.");
        }
      }
    };
    // Background tabs stop polling; refresh as soon as the tab is visible again.
    const tickIfVisible = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };
    tickIfVisible();
    const interval = window.setInterval(tickIfVisible, activeIdRef.current ? THREAD_POLL_MS : INBOX_POLL_MS);
    document.addEventListener("visibilitychange", tickIfVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tickIfVisible);
    };
    // Re-arm the poll when switching list vs thread or showing Messages.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load helpers close over onUnread
  }, [visible, active?.chat.id]);

  useEffect(() => {
    if (!active?.chat.id) {
      return;
    }
    inputRef.current?.focus();
    autosize();
  }, [active?.chat.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !active) {
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
  }, [active]);

  function autosize() {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  async function openChat(item: InboxChat) {
    const navigation = ++navigationRef.current;
    setError(null);
    pinnedRef.current = true;
    try {
      let data: ThreadPayload | undefined;
      if (item.id) {
        data = await loadThread(item.id);
      } else if (item.kind === "GROUP" && item.packageRowId) {
        data = await readData<ThreadPayload>(
          await fetch("/api/hub-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "GROUP", packageRowId: item.packageRowId })
          })
        );
      } else if (item.kind === "DIRECT" && item.peer?.id) {
        data = await readData<ThreadPayload>(
          await fetch("/api/hub-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "DIRECT", userId: item.peer.id })
          })
        );
      }
      if (navigation !== navigationRef.current || !data) {
        return;
      }
      activeIdRef.current = data.chat.id;
      setInput(draftsRef.current[data.chat.id] ?? "");
      setActive(data);
      await loadInbox();
    } catch (caught) {
      if (navigation === navigationRef.current) {
        setError(caught instanceof Error ? caught.message : "Could not open that chat.");
      }
    }
  }

  async function send() {
    const content = input.trim();
    const chatId = active?.chat.id;
    if (!content || !chatId || busy) {
      return;
    }
    const navigation = navigationRef.current;
    setBusy(true);
    setError(null);
    pinnedRef.current = true;
    try {
      await readData<{ message: ThreadMessage }>(
        await fetch(`/api/hub-chat/${chatId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: content })
        })
      );
      if (draftsRef.current[chatId] === input) {
        delete draftsRef.current[chatId];
        if (activeIdRef.current === chatId) {
          setInput("");
        }
      }
      if (navigation !== navigationRef.current) {
        return;
      }
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
        }
      });
      const data = await loadThread(chatId);
      if (navigation === navigationRef.current) {
        setActive(data);
        await loadInbox();
      }
    } catch (caught) {
      if (navigation === navigationRef.current) {
        setError(caught instanceof Error ? caught.message : "Could not send.");
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const query = search.trim().toLowerCase();
  const matches = (title: string, extra = "") =>
    !query || title.toLowerCase().includes(query) || extra.toLowerCase().includes(query);
  const chatKey = (chat: InboxChat) => chat.id ?? chat.packageRowId ?? chat.peer?.id ?? chat.title;
  const listedChats = (inbox?.chats ?? []).filter((chat) => matches(chat.title, chat.subtitle));
  const startPeople = query
    ? (inbox?.members ?? []).filter((person) => matches(person.name))
    : [];

  if (active) {
    const meId = active.me.id;
    const showNames = active.chat.kind === "GROUP";
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              navigationRef.current += 1;
              activeIdRef.current = null;
              setActive(null);
            }}
            className="grid h-10 w-10 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground sm:h-7 sm:w-7"
            aria-label="Back to messages"
          >
            <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-foreground">{active.chat.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{active.chat.subtitle}</p>
          </div>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3 text-[13.5px] leading-relaxed">
          {active.messages.length === 0 ? (
            <p className="text-muted-foreground">No messages yet. Say hi.</p>
          ) : null}
          {active.messages.map((message) => {
            const mine = message.authorId === meId;
            return (
              <article key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-[13.5px] leading-relaxed",
                    mine
                      ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                      : "border border-border bg-card text-foreground"
                  )}
                >
                  {showNames && !mine ? (
                    <p className={cn("mb-0.5 text-[11px] font-medium", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {message.author.name}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {formatStamp(message.createdAt)}
                  </p>
                </div>
              </article>
            );
          })}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </div>
          ) : null}
        </div>
        <form
          onSubmit={onSubmit}
          className={cn(
            "border-t border-border bg-background p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-2.5",
            keyboardOpen && "pb-2.5"
          )}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                draftsRef.current[active.chat.id] = event.target.value;
                setInput(event.target.value);
                requestAnimationFrame(autosize);
              }}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Message…"
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
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-3 py-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={inbox?.canStartDirect ? "Search chats or people…" : "Search chats…"}
          className="h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:h-auto sm:py-1.5 sm:text-[13px]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error ? (
          <p className="px-2 py-2 text-[12.5px] text-destructive">{error}</p>
        ) : null}
        {listedChats.length === 0 && startPeople.length === 0 ? (
          <p className="px-2 py-1.5 text-[12.5px] text-muted-foreground">
            {query
              ? "No matching chats."
              : inbox?.canStartDirect
                ? "No chats yet. Search for a person to start one."
                : "No chats yet."}
          </p>
        ) : (
          <>
            {listedChats.map((chat) => (
              <InboxRow
                key={chatKey(chat)}
                title={chat.title}
                subtitle={chat.kind === "GROUP" ? chat.subtitle : chat.preview || "Direct"}
                unread={chat.unreadCount}
                onClick={() => void openChat(chat)}
              />
            ))}
            {startPeople.map((person) => (
              <InboxRow
                key={person.id}
                title={person.name}
                subtitle="Message"
                unread={0}
                onClick={() =>
                  void openChat({
                    id: null,
                    kind: "DIRECT",
                    title: person.name,
                    subtitle: "Direct",
                    preview: null,
                    updatedAt: null,
                    unreadCount: 0,
                    peer: person
                  })
                }
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function InboxRow({
  title,
  subtitle,
  unread,
  onClick
}: {
  title: string;
  subtitle: string;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2.5 text-left hover:bg-accent sm:min-h-0 sm:py-1.5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-foreground">{title}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{subtitle}</span>
      </span>
      {unread > 0 ? (
        <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
