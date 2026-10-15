"use client";

import { useEffect, useRef, useState } from "react";
import { InboxList } from "@/components/assistant/inbox-list";
import {
  chatKey,
  INBOX_FULL_REFRESH_MS,
  INBOX_POLL_MS,
  mergeLiteInbox,
  readData,
  THREAD_POLL_MS,
  type InboxChat,
  type InboxPayload,
  type ThreadMessage,
  type ThreadPayload
} from "@/components/assistant/hub-chat-client";
import { ThreadView } from "@/components/assistant/thread-view";
import { useStickToBottom } from "@/components/assistant/use-stick-to-bottom";

function withoutKey(record: Record<string, string>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

function prefersFinePointer() {
  return window.matchMedia("(pointer: fine)").matches;
}

/**
 * Messages in the ✱ panel: the inbox (one recency list of group and direct chats) and an open
 * conversation. Polls only while it is on screen and the browser tab is visible.
 */
export function HubMessages({
  onUnread,
  visible = true,
  focusSearchOnShow = true,
  keyboardOpen = false,
  touch = false,
  sheet = false
}: {
  onUnread?: (count: number) => void;
  visible?: boolean;
  /** False when Messages was shown from the keyboard on the panel's tabs: focus stays there. */
  focusSearchOnShow?: boolean;
  keyboardOpen?: boolean;
  /** 44px controls and 16px text (phones and touch tablets). */
  touch?: boolean;
  /** Shown as the phone's full-screen sheet. */
  sheet?: boolean;
}) {
  const [inbox, setInbox] = useState<InboxPayload | null>(null);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ThreadPayload | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // After Back on a touch screen: the chat whose inbox row should get focus.
  const returnFocusIdRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const draftsRef = useRef<Record<string, string>>({});
  const navigationRef = useRef(0);
  const lastFullInboxRef = useRef(0);
  const pinnedRef = useStickToBottom(scrollRef, visible ? (active?.chat.id ?? null) : null);

  async function loadInbox(mode: "full" | "auto" = "full") {
    const lite = mode === "auto" && Date.now() - lastFullInboxRef.current < INBOX_FULL_REFRESH_MS;
    const data = await readData<InboxPayload>(await fetch(lite ? "/api/hub-chat?lite=1" : "/api/hub-chat"));
    if (lite) {
      setInbox((previous) => mergeLiteInbox(previous, data));
    } else {
      lastFullInboxRef.current = Date.now();
      setInbox(data);
    }
    onUnread?.(data.unreadCount);
    return data;
  }

  async function loadThread(chatId: string) {
    return readData<ThreadPayload>(await fetch(`/api/hub-chat/${chatId}`));
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    // Opening Messages (or a chat) loads the full lists; interval ticks poll lite.
    let firstTick = true;
    const tick = async () => {
      const navigation = navigationRef.current;
      const mode = firstTick ? "full" : "auto";
      firstTick = false;
      try {
        const chatId = activeIdRef.current;
        const [, data] = await Promise.all([loadInbox(mode), chatId ? loadThread(chatId) : null]);
        if (cancelled || navigation !== navigationRef.current) {
          return;
        }
        // A good poll clears an earlier error.
        setError(null);
        if (chatId && data && activeIdRef.current === chatId) {
          setActive(data);
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

  // Showing Messages on a mouse/trackpad puts the cursor in search (as Assistant does its composer).
  useEffect(() => {
    if (visible && focusSearchOnShow && !activeIdRef.current && prefersFinePointer()) {
      searchRef.current?.focus();
    }
  }, [visible, focusSearchOnShow]);

  // Opening a chat focuses the composer on a mouse/trackpad; on touch screens the thread title,
  // so no keyboard covers the conversation.
  useEffect(() => {
    if (active?.chat.id) {
      (prefersFinePointer() ? inputRef.current : titleRef.current)?.focus();
    }
  }, [active?.chat.id]);

  // Back: a mouse/trackpad goes to search; touch screens to the row of the chat just left.
  useEffect(() => {
    if (active) {
      return;
    }
    const chatId = returnFocusIdRef.current;
    returnFocusIdRef.current = null;
    if (prefersFinePointer()) {
      if (chatId) {
        searchRef.current?.focus();
      }
      return;
    }
    if (chatId) {
      listRef.current?.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(chatId)}"]`)?.focus();
    }
  }, [active]);

  async function openChat(item: InboxChat) {
    const navigation = ++navigationRef.current;
    setError(null);
    setOpeningKey(chatKey(item));
    pinnedRef.current = true;
    try {
      let data: ThreadPayload | undefined;
      if (item.id) {
        data = await loadThread(item.id);
      } else if (item.kind === "GROUP" && item.packageRowId) {
        // First open of a package's group chat creates it.
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
      await loadInbox("auto");
    } catch (caught) {
      if (navigation === navigationRef.current) {
        setError(caught instanceof Error ? caught.message : "Could not open that chat.");
      }
    } finally {
      if (navigation === navigationRef.current) {
        setOpeningKey(null);
      }
    }
  }

  function backToInbox() {
    navigationRef.current += 1;
    returnFocusIdRef.current = activeIdRef.current;
    activeIdRef.current = null;
    setActive(null);
    setOpeningKey(null);
  }

  function onInput(value: string) {
    if (active) {
      draftsRef.current = { ...draftsRef.current, [active.chat.id]: value };
    }
    setInput(value);
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
      // Clear the draft only if it is still the text that was sent.
      if (draftsRef.current[chatId] === input) {
        draftsRef.current = withoutKey(draftsRef.current, chatId);
        if (activeIdRef.current === chatId) {
          setInput("");
        }
      }
      if (navigation !== navigationRef.current) {
        return;
      }
      const data = await loadThread(chatId);
      if (navigation === navigationRef.current) {
        setActive(data);
        await loadInbox("auto");
      }
    } catch (caught) {
      if (navigation === navigationRef.current) {
        setError(caught instanceof Error ? caught.message : "Could not send.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <ThreadView
        thread={active}
        scrollRef={scrollRef}
        inputRef={inputRef}
        titleRef={titleRef}
        input={input}
        onInput={onInput}
        onSend={() => void send()}
        busy={busy}
        error={error}
        onBack={backToInbox}
        keyboardOpen={keyboardOpen}
        touch={touch}
        sheet={sheet}
      />
    );
  }

  return (
    <InboxList
      inbox={inbox}
      error={error}
      search={search}
      onSearch={setSearch}
      searchRef={searchRef}
      listRef={listRef}
      openingKey={openingKey}
      onOpen={(chat) => void openChat(chat)}
      touch={touch}
    />
  );
}
