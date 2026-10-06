"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantAudience } from "@/components/assistant-panel";

const UNREAD_POLL_MS = 30_000;

const loadAssistantPanel = () => import("@/components/assistant-panel");

// The panel (chat, cards, Messages) only loads once someone opens it, so it stays out of the
// shell bundle every page loads. Hovering or focusing the launcher starts the download early.
const AssistantPanel = dynamic(() => loadAssistantPanel().then((m) => m.AssistantPanel), { ssr: false });

function preloadAssistantPanel() {
  void loadAssistantPanel().catch(() => {
    // The click retries the download.
  });
}

export function AssistantChat({
  canMutate = false,
  audience = "member"
}: {
  canMutate?: boolean;
  audience?: AssistantAudience;
}) {
  const [open, setOpen] = useState(false);
  // Stays true after the first open so the conversation survives closing the panel.
  const [panelMounted, setPanelMounted] = useState(false);
  const [unread, setUnread] = useState(0);
  // While Messages is on screen its inbox poll already reports the unread count.
  const messagesPollingRef = useRef(false);

  const closePanel = useCallback(() => setOpen(false), []);
  const setMessagesPolling = useCallback((active: boolean) => {
    messagesPollingRef.current = active;
  }, []);

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
    const interval = window.setInterval(tickIfVisible, UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", tickIfVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tickIfVisible);
    };
  }, []);

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setPanelMounted(true);
            setOpen(true);
          }}
          onPointerEnter={preloadAssistantPanel}
          onFocus={preloadAssistantPanel}
          aria-label={unread > 0 ? `Open Portal assistant, ${unread} unread messages` : "Open Portal assistant"}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-50 grid h-12 w-12 place-items-center rounded-md bg-primary text-primary-foreground transition hover:bg-[var(--brand-fill-hover)] active:scale-95"
        >
          <span className="text-2xl leading-none" aria-hidden>
            ✱
          </span>
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-md bg-destructive px-1 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      ) : null}

      {panelMounted ? (
        <AssistantPanel
          open={open}
          onClose={closePanel}
          unread={unread}
          onUnread={setUnread}
          onMessagesPolling={setMessagesPolling}
          canMutate={canMutate}
          audience={audience}
        />
      ) : null}
    </>
  );
}
