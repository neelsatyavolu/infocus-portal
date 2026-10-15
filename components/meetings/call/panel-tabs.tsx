"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from "react";
import { rovingIndex } from "@/components/kit/roving";
import { cn } from "@/src/lib/utils";
import { CallCount } from "./call-count";

export type CallPanelId = "people" | "chat" | "agenda";

type PanelCounts = {
  /** People in the call (the Notes participant excluded). */
  people: number;
  /** Lobby count; 0 for non-hosts. */
  waiting: number;
  unread: number;
  agendaLeft: number;
};

type PanelTabsValue = PanelCounts & {
  active: CallPanelId | null;
  select: (id: CallPanelId) => void;
  /** Set when a keyboard switch should land focus on the new panel's active tab. */
  focusTab: MutableRefObject<boolean>;
};

const PanelTabsContext = createContext<PanelTabsValue | null>(null);

type ChatDraft = readonly [string, Dispatch<SetStateAction<string>>];

/** Separate from the tabs value so typing re-renders only the chat box, not the tab header. */
const ChatDraftContext = createContext<ChatDraft | null>(null);

/**
 * People, Chat and Agenda as one tabbed panel. CallRoom wraps its panel area in this; SidePanel
 * reads it to draw tabs instead of a plain title (AgendaPanel keeps calling SidePanel as before).
 */
export function PanelTabsProvider({
  active,
  onSelect,
  counts,
  children
}: {
  active: CallPanelId | null;
  onSelect: (id: CallPanelId) => void;
  counts: PanelCounts;
  children: ReactNode;
}) {
  const focusTab = useRef(false);
  const [draft, setDraft] = useState("");
  const { people, waiting, unread, agendaLeft } = counts;
  const value = useMemo(
    () => ({ active, select: onSelect, people, waiting, unread, agendaLeft, focusTab }),
    [active, onSelect, people, waiting, unread, agendaLeft]
  );
  const chatDraft = useMemo<ChatDraft>(() => [draft, setDraft], [draft]);
  return (
    <PanelTabsContext.Provider value={value}>
      <ChatDraftContext.Provider value={chatDraft}>{children}</ChatDraftContext.Provider>
    </PanelTabsContext.Provider>
  );
}

export function usePanelTabs() {
  return useContext(PanelTabsContext);
}

/**
 * The chat box's unsent text. Inside the tabbed panel it lives in the provider, so switching to
 * People or Agenda (which unmounts ChatPanel) keeps it; outside a provider it is local state.
 */
export function useChatDraft(): ChatDraft {
  const shared = useContext(ChatDraftContext);
  const local = useState("");
  return shared ?? local;
}

export const PANEL_BODY_ID = "call-panel-body";

export function panelTabId(id: CallPanelId) {
  return `call-panel-tab-${id}`;
}

const TABS: ReadonlyArray<{ id: CallPanelId; label: string }> = [
  { id: "people", label: "People" },
  { id: "chat", label: "Chat" },
  { id: "agenda", label: "Agenda" }
];

function TabCount({ tabs, id }: { tabs: PanelTabsValue; id: CallPanelId }) {
  if (id === "people") {
    return (
      <>
        <CallCount count={tabs.people} tone="neutral" showZero srLabel={`${tabs.people} in the call`} />
        <CallCount count={tabs.waiting} tone="warn" srLabel={`${tabs.waiting} waiting to join`} />
      </>
    );
  }
  if (id === "chat") return <CallCount count={tabs.unread} tone="brand" srLabel={`${tabs.unread} unread`} />;
  return <CallCount count={tabs.agendaLeft} tone="neutral" srLabel={`${tabs.agendaLeft} left`} />;
}

/** Tabs in the panel header: 48px tall, the active one with a 2px green underline. */
export function PanelTabList({ tabs }: { tabs: PanelTabsValue }) {
  // A keyboard switch remounts the panel; put focus back on the (new) active tab.
  useEffect(() => {
    if (!tabs.focusTab.current || !tabs.active) return;
    tabs.focusTab.current = false;
    document.getElementById(panelTabId(tabs.active))?.focus();
  }, [tabs.active, tabs.focusTab]);

  function select(id: CallPanelId, byKeyboard: boolean) {
    tabs.focusTab.current = byKeyboard;
    tabs.select(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(index, event.key, TABS.map(() => false));
    if (next === null) return;
    event.preventDefault();
    select(TABS[next].id, true);
  }

  return (
    <div role="tablist" aria-label="Call panels" className="flex min-w-0 items-stretch gap-1 overflow-x-auto [scrollbar-width:none]">
      {TABS.map((tab, index) => {
        const active = tabs.active === tab.id;
        return (
          <button
            key={tab.id}
            id={panelTabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={active ? PANEL_BODY_ID : undefined}
            tabIndex={active ? 0 : -1}
            // detail 0 = Enter/Space, not a pointer.
            onClick={(event: MouseEvent<HTMLButtonElement>) => select(tab.id, event.detail === 0)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative inline-flex h-12 shrink-0 items-center gap-1.5 px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-green)]",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            <TabCount tabs={tabs} id={tab.id} />
            {active ? <span aria-hidden className="absolute inset-x-1 bottom-0 h-0.5 bg-[var(--brand-green)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}
