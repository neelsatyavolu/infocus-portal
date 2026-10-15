"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { IconButton } from "./call-button";
import { PANEL_BODY_ID, PanelTabList, panelTabId, usePanelTabs } from "./panel-tabs";
import { useVisualViewport } from "./use-call-helpers";

/**
 * Right-hand panel on desktop (360px); on phones a full-height sheet sized to the visual viewport,
 * so the on-screen keyboard never covers the footer (chat input). Inside the call's tabbed panel
 * (PanelTabsProvider) the header shows People / Chat / Agenda tabs instead of the title, so people
 * switch in place.
 */
export function SidePanel({
  title,
  onClose,
  mobile,
  children,
  footer
}: {
  title: string;
  onClose: () => void;
  mobile: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const viewport = useVisualViewport();
  const tabs = usePanelTabs();
  const sheetStyle: CSSProperties | undefined =
    mobile && viewport ? { top: viewport.top, height: viewport.height } : undefined;
  const activeTab = tabs?.active ?? null;

  return (
    <aside
      aria-label={title}
      role={mobile ? "dialog" : undefined}
      aria-modal={mobile ? true : undefined}
      style={sheetStyle}
      className={cn(
        "flex flex-col border-[var(--ink-4)] bg-[var(--ink-2)]",
        mobile
          ? "fixed inset-x-0 top-0 z-40 h-dvh overscroll-contain pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
          : "w-[360px] shrink-0 border-l"
      )}
    >
      <header className="flex h-12 shrink-0 items-stretch justify-between gap-2 border-b border-[var(--ink-4)] pl-2 pr-1.5">
        {tabs && activeTab ? (
          <>
            {/* The tabs replace the visible title; the heading (with People's head count) stays for screen readers. */}
            <h2 className="sr-only">{title}</h2>
            <PanelTabList tabs={tabs} />
          </>
        ) : (
          <h2 className="self-center pl-2 text-base font-semibold text-foreground">{title}</h2>
        )}
        <IconButton size={mobile ? "touch" : "md"} className="self-center" label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X />
        </IconButton>
      </header>
      <div
        id={activeTab ? PANEL_BODY_ID : undefined}
        role={activeTab ? "tabpanel" : undefined}
        aria-labelledby={activeTab ? panelTabId(activeTab) : undefined}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {children}
      </div>
      {footer ? (
        <div className={cn("border-t border-[var(--ink-4)] p-4", mobile && "pb-[max(1rem,env(safe-area-inset-bottom))]")}>
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
