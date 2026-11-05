"use client";

import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, PanelRightClose, X } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { IconButton } from "@/components/kit/icon-button";
import { DAY_PANEL_ID, formatLongDate, type DayFailure, type DayModel } from "@/components/master-calendar/calendar-model";
import { dayTags } from "@/components/master-calendar/day-cell";
import DayEditSections, { type DayEditActions } from "@/components/master-calendar/day-edit-sections";
import { DayReadSections } from "@/components/master-calendar/day-sections";

const TITLE_ID = "master-calendar-day-title";
const HEADER_H = "var(--app-header-h, 3.5rem)";
/** The phone tab bar plus the home indicator below it (the bar pads itself by the safe area). */
const TABBAR_H = "calc(var(--phone-tabbar-h, 0px) + env(safe-area-inset-bottom, 0px))";

const NAV_BUTTON = "pointer-coarse:h-10 pointer-coarse:w-10";

/**
 * The selected day: date, every tag, then its sections (editable for producers). The same panel
 * docks beside the board, opens as a drawer over it, or opens as a sheet on narrow screens; it is
 * never modal, so the package
 * picker, the pill popover and the notes field work inside it. Only the body is keyed by the day,
 * so the header's Previous / Next buttons keep focus while stepping.
 */
export function DayPanel({
  day,
  pinned,
  canEdit,
  saving,
  failure,
  busy,
  wipingAnchors,
  members,
  managerPool,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onDismiss,
  onDismissFailure,
  actions
}: {
  day: DayModel;
  /** Docked beside the board (it can be hidden); otherwise it was opened for a day (it can be closed). */
  pinned: boolean;
  canEdit: boolean;
  saving: boolean;
  failure: DayFailure | null;
  busy: boolean;
  wipingAnchors: boolean;
  members: string[];
  managerPool: string[];
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onDismiss: () => void;
  onDismissFailure: () => void;
  actions: DayEditActions;
}) {
  const tags = dayTags(day, { saving, failed: failure?.kind === "save" }, { panel: true });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="space-y-2 border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id={TITLE_ID} className="min-w-0 pt-1 text-lg font-semibold leading-tight tracking-[-0.01em] text-foreground">
            {formatLongDate(day.dateKey)}
          </h2>
          <div className="-mr-1 flex shrink-0 items-center gap-1">
            <IconButton label="Previous day (K)" icon={ChevronLeft} size="sm" onClick={onPrevious} disabled={!hasPrevious} className={NAV_BUTTON} />
            <IconButton label="Next day (J)" icon={ChevronRight} size="sm" onClick={onNext} disabled={!hasNext} className={NAV_BUTTON} />
            <IconButton
              label={pinned ? "Hide day panel" : "Close"}
              icon={pinned ? PanelRightClose : X}
              size="sm"
              onClick={onDismiss}
              className={NAV_BUTTON}
            />
          </div>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <Fragment key={tag.key}>{tag.node}</Fragment>
            ))}
          </div>
        ) : null}
      </header>
      <div key={day.dateKey} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
        {failure ? (
          <Alert tone="danger" compact onDismiss={onDismissFailure} title={failure.kind === "save" ? "Couldn't save" : "Couldn't randomize"}>
            {failure.message}
          </Alert>
        ) : null}
        {canEdit ? (
          <DayEditSections
            day={day}
            busy={busy}
            wipingAnchors={wipingAnchors}
            members={members}
            managerPool={managerPool}
            actions={actions}
          />
        ) : (
          <DayReadSections day={day} />
        )}
      </div>
    </div>
  );
}

/** Moves focus into a panel that opened for a day (a docked panel never takes focus by itself). */
function useFocusOnOpen(ref: RefObject<HTMLElement | null>, enabled = true) {
  const enabledRef = useRef(enabled);
  useEffect(() => {
    if (enabledRef.current) ref.current?.focus({ preventScroll: true });
  }, [ref]);
}

/** The shell's #main, so a fixed panel picks up its --app-header-h / --phone-tabbar-h. */
function portalTarget() {
  return document.getElementById("main") ?? document.body;
}

/**
 * Wide workspaces: beside the board, sticky under the top bar and above the phone tab bar. Docked
 * (producers) it stays put; opened for a day (`focusOnOpen`) it takes focus like the drawer does.
 */
export function DockedDayPanel({ children, focusOnOpen = false }: { children: ReactNode; focusOnOpen?: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  useFocusOnOpen(ref, focusOnOpen);
  return (
    <aside
      ref={ref}
      id={DAY_PANEL_ID}
      tabIndex={-1}
      aria-labelledby={TITLE_ID}
      className="sticky flex flex-col overflow-hidden rounded-md border border-border bg-card outline-none"
      style={{
        top: `calc(${HEADER_H} + 1rem)`,
        maxHeight: `calc(100dvh - ${HEADER_H} - ${TABBAR_H} - 2rem)`
      }}
    >
      {children}
    </aside>
  );
}

/**
 * Medium workspaces: a drawer over the right edge of the agenda, below the top bar and above the
 * phone tab bar, no scrim. The board keeps its width, so nothing under the pointer moves, and the
 * date rail and summaries on the left of each row stay in view.
 */
export function DrawerDayPanel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  useFocusOnOpen(ref);
  return createPortal(
    <aside
      ref={ref}
      id={DAY_PANEL_ID}
      tabIndex={-1}
      aria-labelledby={TITLE_ID}
      className="fixed right-0 z-30 flex w-80 max-w-full flex-col border-l border-border bg-card outline-none motion-safe:animate-[sheet-in-right_240ms_cubic-bezier(0.16,1,0.3,1)]"
      style={{ top: HEADER_H, bottom: TABBAR_H }}
    >
      {children}
    </aside>,
    portalTarget()
  );
}

/**
 * Narrow workspaces (phones, small tablets): a full-width sheet below the top bar and above the
 * phone tab bar (and the home indicator), no scrim. The page behind it is made inert by the client.
 */
export function SheetDayPanel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  useFocusOnOpen(ref);
  return createPortal(
    <aside
      ref={ref}
      id={DAY_PANEL_ID}
      tabIndex={-1}
      aria-labelledby={TITLE_ID}
      className="fixed inset-x-0 z-30 flex flex-col border-t border-border bg-card outline-none motion-safe:animate-[sheet-in-bottom_240ms_cubic-bezier(0.16,1,0.3,1)]"
      style={{ top: HEADER_H, bottom: TABBAR_H }}
    >
      {children}
    </aside>,
    portalTarget()
  );
}
