"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { AssistantConversation } from "@/components/assistant/assistant-conversation";
import { isSafePlaceHref } from "@/components/assistant/assistant-stream";
import { ChatComposer } from "@/components/assistant/chat-composer";
import { openingTab } from "@/components/assistant/opening-tab";
import { loopFocus } from "@/components/assistant/panel-focus";
import { PanelHeader, panelPaneId, panelTabId, type PanelMode } from "@/components/assistant/panel-header";
import { useAssistantChat } from "@/components/assistant/use-assistant-chat";
import { usePanelBox, type PanelBox } from "@/components/assistant/use-panel-box";
import { useStickToBottom } from "@/components/assistant/use-stick-to-bottom";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";
import { Button } from "@/components/ui/button";
import type { AssistantAudience } from "@/src/lib/assistant-access";
import type { AssistantPlacePreview } from "@/src/lib/assistant-places";
import { cn } from "@/src/lib/utils";

// Only rendered once Messages is opened, so keep it out of the panel's own chunk too.
const HubMessages = dynamic(() => import("@/components/hub-messages").then((m) => m.HubMessages), {
  ssr: false
});

/** Last tab used, per browser (stored as infocus:ui:assistant-tab:v1). */
const TAB_KEY = "assistant-tab:v1";

function isPanelMode(value: unknown): value is PanelMode {
  return value === "assistant" || value === "messages";
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The phone sheet covers everything, the phone tab bar included.
const SHEET_CLASS = "fixed inset-x-0 top-0 z-[70] flex flex-col overflow-hidden bg-card";

// The corner card opens where the ✱ sits: same right edge, same bottom (above the phone tab bar),
// and its top stays 1.25rem below the sticky top bar (--app-header-h) so it never hides it.
// z-[51]: over the upload toast that shares this corner (z-50, portaled to <body>), the top bar
// and the tab bar (z-40); under the phone nav drawer (z-60). While a modal layer is open (dialog,
// ⌘K, menu, select: Radix marks <body data-scroll-locked>) it drops to z-[45], so that layer's
// overlay dims the card and the layer sits on top. No shadow is allowed (DESIGN §14), so its edge
// is the 3:1 control line (border-input): the card stays distinct where it overlaps page cards.
const CARD_CLASS = cn(
  "fixed z-[51] [body[data-scroll-locked]_&]:z-[45] flex flex-col overflow-hidden rounded-md border border-input bg-card",
  "motion-safe:animate-[card-enter_200ms_cubic-bezier(0.16,1,0.3,1)_both]",
  "right-[max(1.25rem,env(safe-area-inset-right))] bottom-[calc(var(--phone-tabbar-h,0px)+max(1.25rem,env(safe-area-inset-bottom)))]",
  "w-[min(28rem,calc(100vw-2.5rem))] h-[min(42.5rem,calc(100dvh-var(--app-header-h,0px)-var(--phone-tabbar-h,0px)-2.5rem))]"
);

function frameStyle(box: PanelBox | null): CSSProperties | undefined {
  if (!box) {
    return undefined;
  }
  if (box.mode === "sheet") {
    return { top: box.top, height: box.height, bottom: "auto" };
  }
  if (box.keyboardInset > 0) {
    // Touch tablets: lift the card above the on-screen keyboard, still clear of the top bar.
    return {
      top: "auto",
      bottom: `calc(${box.keyboardInset}px + 1.25rem)`,
      height: `min(42.5rem, calc(${Math.max(0, box.viewportHeight - 40)}px - var(--app-header-h, 0px)))`
    };
  }
  return undefined;
}

/**
 * The open ✱ panel: Assistant (the Portal chatbot) and Messages (group and direct chat). Loaded
 * on demand by the launcher in assistant-chat.tsx and kept mounted after the first open, so the
 * assistant conversation survives closing the panel. A full-screen sheet on phones, a corner
 * card on larger screens. At every size the page behind stops scrolling while it is open.
 */
export function AssistantPanel({
  open,
  onClose,
  unread,
  onUnread,
  onMessagesPolling,
  onAssistantNews,
  canMutate,
  audience,
  panelId
}: {
  open: boolean;
  onClose: () => void;
  unread: number;
  onUnread: Dispatch<SetStateAction<number>>;
  /** True while Messages is on screen; its inbox poll then reports the unread count. */
  onMessagesPolling: (active: boolean) => void;
  /** True while an assistant reply you haven't seen is waiting on the Assistant tab. */
  onAssistantNews?: (news: boolean) => void;
  canMutate: boolean;
  audience: AssistantAudience;
  panelId?: string;
}) {
  const router = useRouter();
  const idPrefix = useId();
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewingAssistantRef = useRef(false);
  const [mode, setMode] = useState<PanelMode>("assistant");
  const [shownOpen, setShownOpen] = useState(false);
  const [assistantNews, setAssistantNews] = useState(false);
  // The unread count the reader already turned away from (picked Assistant over it). Opening
  // jumps to Messages only for unread beyond that, so a lingering count doesn't hijack every open.
  const [declinedUnread, setDeclinedUnread] = useState(0);
  // Whether showing a tab puts the cursor in it (composer, search). Not after Arrow/Home/End on
  // the tabs, so focus stays on the tablist and the next arrow press still switches tabs.
  const [focusPaneOnShow, setFocusPaneOnShow] = useState(true);
  const pinnedRef = useStickToBottom(scrollRef, open && mode === "assistant");
  const box = usePanelBox(open);
  const sheet = box?.mode === "sheet";
  const touch = sheet || Boolean(box?.coarse);
  const keyboardOpen = box?.mode === "sheet" && box.keyboard;

  const chat = useAssistantChat({
    onSend: () => {
      pinnedRef.current = true;
    },
    onReplyLanded: () => {
      if (!viewingAssistantRef.current) {
        setAssistantNews(true);
      }
    }
  });

  // Read messages lower the bar again, so the next new one opens Messages.
  const declined = Math.min(declinedUnread, unread);
  if (declined !== declinedUnread) {
    setDeclinedUnread(declined);
  }

  // Each time it opens, pick the tab (see openingTab). The pick counts for this render too, so
  // the reply-seen check below looks at the tab the reader actually lands on, not the old one.
  let shownMode = mode;
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      shownMode = openingTab({
        busy: chat.busy,
        hasOpenApproval: chat.hasOpenApproval,
        unread,
        declinedUnread: declined,
        assistantNews,
        remembered: () => readRemembered(browserStorage(), TAB_KEY, "assistant", isPanelMode)
      });
      setMode(shownMode);
      setFocusPaneOnShow(true);
    }
  }
  if (assistantNews && open && shownMode === "assistant") {
    setAssistantNews(false);
  }

  useEffect(() => {
    viewingAssistantRef.current = open && mode === "assistant";
  }, [open, mode]);

  /** A tab the reader picked (not one chosen for them on open): remembered for next time. */
  function pickMode(next: PanelMode, via: "click" | "keys") {
    setMode(next);
    setFocusPaneOnShow(via === "click");
    writeRemembered(browserStorage(), TAB_KEY, next);
    if (next === "assistant") {
      setDeclinedUnread(unread);
    }
  }

  useEffect(() => {
    onAssistantNews?.(assistantNews);
  }, [assistantNews, onAssistantNews]);

  useEffect(() => {
    onMessagesPolling(open && mode === "messages");
  }, [open, mode, onMessagesPolling]);

  useEffect(() => {
    if (open && mode === "assistant" && focusPaneOnShow && window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, [open, mode, focusPaneOnShow]);

  // The ✱ that had focus hides on open. On touch screens (where the composer and search don't
  // take focus, so no keyboard pops up) focus lands on the active tab instead of <body>.
  useEffect(() => {
    if (open && !window.matchMedia("(pointer: fine)").matches) {
      document.getElementById(panelTabId(idPrefix, mode))?.focus();
    }
    // Only on open: switching tabs moves focus by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The page behind stops scrolling while the panel is open (sheet and corner card alike).
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
    if (!open) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      // Any Escape closes the panel, wherever focus is (an IME composition's Escape stays with it).
      if (event.key === "Escape" && !event.isComposing) {
        onClose();
      } else if (event.key === "Tab" && sheet && panelRef.current) {
        loopFocus(panelRef.current, event);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, sheet]);

  function clearConversation() {
    chat.clear();
    inputRef.current?.focus();
  }

  function goToPlace(place: AssistantPlacePreview) {
    if (!isSafePlaceHref(place.href)) {
      return;
    }
    chat.setPlace(place.id, "opened");
    if (place.external && place.newTab) {
      window.open(place.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (place.external) {
      window.location.assign(place.href);
      return;
    }
    onClose();
    router.push(place.href as never);
  }

  if (!open) {
    return null;
  }

  return (
    <section
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Assistant and Messages"
      aria-modal={sheet || undefined}
      className={sheet ? SHEET_CLASS : CARD_CLASS}
      style={frameStyle(box)}
    >
      <PanelHeader
        idPrefix={idPrefix}
        mode={mode}
        onModeChange={pickMode}
        unread={unread}
        assistantNews={assistantNews}
        canClear={mode === "assistant" && chat.messages.length > 0}
        clearDisabled={chat.busy}
        onClear={clearConversation}
        onClose={onClose}
        touch={touch}
        safeAreaTop={sheet}
      />

      <div
        id={panelPaneId(idPrefix, "messages")}
        role="tabpanel"
        aria-labelledby={panelTabId(idPrefix, "messages")}
        className={cn("flex min-h-0 flex-1 flex-col", mode !== "messages" && "hidden")}
      >
        <HubMessages
          visible={mode === "messages"}
          focusSearchOnShow={focusPaneOnShow}
          onUnread={onUnread}
          keyboardOpen={keyboardOpen}
          touch={touch}
          sheet={sheet}
        />
      </div>

      <div
        id={panelPaneId(idPrefix, "assistant")}
        role="tabpanel"
        aria-labelledby={panelTabId(idPrefix, "assistant")}
        className={cn("flex min-h-0 flex-1 flex-col", mode !== "assistant" && "hidden")}
      >
        <AssistantConversation
          scrollRef={scrollRef}
          messages={chat.messages}
          busy={chat.busy}
          statusSteps={chat.statusSteps}
          error={chat.error}
          actionState={chat.actionState}
          actionNote={chat.actionNote}
          placeState={chat.placeState}
          audience={audience}
          canMutate={canMutate}
          touch={touch}
          onPickStarter={(starter) => void chat.send(starter)}
          onApprove={(token) => void chat.decideAction(token, true)}
          onDismissAction={(token) => void chat.decideAction(token, false)}
          onGoToPlace={goToPlace}
          onDismissPlace={(id) => chat.setPlace(id, "dismissed")}
        />
        {chat.cleared ? (
          <div
            role="status"
            className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-1 text-[13px] text-[var(--ink-text)]"
          >
            <span>Conversation cleared.</span>
            <Button
              type="button"
              variant="ghost"
              onClick={chat.undoClear}
              className={cn("-mr-3 px-3 text-brand-green hover:text-brand-green", touch ? "h-10" : "h-8")}
            >
              Undo
            </Button>
          </div>
        ) : null}
        <ChatComposer
          ref={inputRef}
          value={chat.input}
          onChange={chat.setInput}
          onSubmit={() => void chat.send()}
          busy={chat.busy}
          placeholder="Ask anything about Portal…"
          ariaLabel="Ask the Portal assistant"
          touch={touch}
          visible={mode === "assistant"}
          safeAreaBottom={sheet && !keyboardOpen}
        />
      </div>
    </section>
  );
}
