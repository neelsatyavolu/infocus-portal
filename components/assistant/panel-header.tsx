"use client";

import { useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { CountBadge, StatusDot } from "@/components/kit/status-tag";
import { tabItemClass } from "@/components/kit/tab-styles";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

export type PanelMode = "assistant" | "messages";

const TABS: Array<{ id: PanelMode; label: string }> = [
  { id: "assistant", label: "Assistant" },
  { id: "messages", label: "Messages" }
];

export function panelTabId(idPrefix: string, mode: PanelMode) {
  return `${idPrefix}-tab-${mode}`;
}

export function panelPaneId(idPrefix: string, mode: PanelMode) {
  return `${idPrefix}-pane-${mode}`;
}

/**
 * The panel's one header row: underline tabs (the HubTabs look) on the left, Clear and Close
 * on the right. Every control in the row is one height: 36px, or 44px on touch screens.
 */
export function PanelHeader({
  idPrefix,
  mode,
  onModeChange,
  unread,
  assistantNews,
  canClear,
  clearDisabled,
  onClear,
  onClose,
  touch,
  safeAreaTop
}: {
  idPrefix: string;
  mode: PanelMode;
  /** `via` says how the tab was picked: Arrow/Home/End keys keep focus on the tabs. */
  onModeChange: (mode: PanelMode, via: "click" | "keys") => void;
  unread: number;
  /** A reply landed while you were away from the Assistant tab. */
  assistantNews: boolean;
  canClear: boolean;
  clearDisabled: boolean;
  onClear: () => void;
  onClose: () => void;
  touch: boolean;
  safeAreaTop: boolean;
}) {
  const tabRefs = useRef<Record<PanelMode, HTMLButtonElement | null>>({ assistant: null, messages: null });

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((tab) => tab.id === mode);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = TABS.length - 1;
    if (next === null) {
      return;
    }
    event.preventDefault();
    const target = TABS[next].id;
    onModeChange(target, "keys");
    tabRefs.current[target]?.focus();
  }

  const controlSize = touch ? "h-11" : "h-9";

  return (
    <header
      className={cn(
        "box-content flex shrink-0 items-stretch justify-between gap-2 border-b border-border px-4",
        touch ? "h-14" : "h-12",
        safeAreaTop && "pt-[env(safe-area-inset-top)]"
      )}
    >
      {/* Narrow phones (320px) with a 99+ count scroll the tabs instead of sliding them under Clear. */}
      <div
        role="tablist"
        aria-label="Assistant and Messages"
        className={cn(
          "flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          touch ? "gap-4" : "gap-6"
        )}
      >
        {TABS.map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={panelTabId(idPrefix, tab.id)}
              aria-selected={active}
              aria-controls={panelPaneId(idPrefix, tab.id)}
              tabIndex={active ? 0 : -1}
              onClick={() => onModeChange(tab.id, "click")}
              onKeyDown={onTabKeyDown}
              className={cn(tabItemClass(active, "lg"), touch ? "h-14" : "h-12")}
            >
              {tab.label}
              {tab.id === "messages" ? (
                <CountBadge count={unread} srLabel={`${unread} unread`} />
              ) : assistantNews ? (
                <StatusDot tone="new" label="New reply" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="-mr-2 flex shrink-0 items-center gap-1">
        {canClear ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            disabled={clearDisabled}
            title="Clear conversation"
            className={cn("px-3 text-muted-foreground", controlSize)}
          >
            Clear
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close assistant"
          className={cn("text-muted-foreground", controlSize, touch ? "w-11" : "w-9")}
        >
          <X aria-hidden />
        </Button>
      </div>
    </header>
  );
}
