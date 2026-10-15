"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CountBadge, StatusDot } from "@/components/kit/status-tag";
import type { AssistantAudience } from "@/src/lib/assistant-access";
import { cn } from "@/src/lib/utils";

const UNREAD_POLL_MS = 30_000;
const PANEL_ID = "portal-assistant-panel";

const loadAssistantPanel = () => import("@/components/assistant-panel");

// The panel (chat, cards, Messages) only loads once someone opens it, so it stays out of the
// shell bundle every page loads. Hovering or focusing the launcher starts the download early.
const AssistantPanel = dynamic(() => loadAssistantPanel().then((m) => m.AssistantPanel), { ssr: false });

function preloadAssistantPanel() {
  void loadAssistantPanel().catch(() => {
    // The click retries the download.
  });
}

/**
 * The ✱ launcher for Assistant and Messages: the 48px green button in the bottom-right corner,
 * above the phone tab bar. Hidden while the panel is open.
 *
 * Decision: it stays a floating corner button (approved Assistant spec, part A) rather than a
 * top-bar control. StickyActionBar's right gutter and the upload toast's right edge are set from
 * this button's right-[max(1.25rem,…)], so its offset must not change on its own; moving ✱ into
 * the top bar is a shell change (app-top-bar.tsx, app-shell.tsx) to make together with them.
 */
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
  // An assistant reply landed while you were away from the Assistant tab.
  const [assistantNews, setAssistantNews] = useState(false);
  // While Messages is on screen its inbox poll already reports the unread count.
  const messagesPollingRef = useRef(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

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

  // Closing hands focus back to the ✱, unless the reader already put it somewhere else.
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) {
        launcherRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const label = [
    "Open Portal assistant",
    unread > 0 ? `${unread} unread messages` : null,
    assistantNews ? "new assistant reply" : null
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          setPanelMounted(true);
          setOpen(true);
        }}
        onPointerEnter={preloadAssistantPanel}
        onFocus={preloadAssistantPanel}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        title="Assistant and Messages"
        className={cn(
          "fixed bottom-[calc(var(--phone-tabbar-h,0px)+max(1.25rem,env(safe-area-inset-bottom)))] right-[max(1.25rem,env(safe-area-inset-right))] z-50 grid h-12 w-12 place-items-center rounded-md bg-primary text-primary-foreground transition hover:bg-[var(--brand-fill-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:active:scale-95",
          // The open panel covers the corner, so the button steps aside until it closes.
          open && "hidden"
        )}
      >
        <span aria-hidden className="text-2xl leading-none">
          ✱
        </span>
        {/* On the green button the marks are Soft White (DESIGN.md §10: no green on green). */}
        {unread > 0 ? (
          <CountBadge count={unread} tone="onBrand" className="absolute -right-1 -top-1 ring-2 ring-background" />
        ) : assistantNews ? (
          <StatusDot className="absolute -right-0.5 -top-0.5 bg-[var(--on-brand)] ring-2 ring-background" />
        ) : null}
      </button>

      {panelMounted ? (
        <AssistantPanel
          open={open}
          onClose={closePanel}
          unread={unread}
          onUnread={setUnread}
          onMessagesPolling={setMessagesPolling}
          onAssistantNews={setAssistantNews}
          canMutate={canMutate}
          audience={audience}
          panelId={PANEL_ID}
        />
      ) : null}
    </>
  );
}
