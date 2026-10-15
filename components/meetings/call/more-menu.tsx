"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Kbd } from "@/components/kit/kbd";
import { MEETING_REACTIONS, type MeetingReaction } from "@/src/lib/meetings/protocol";
import type { LayoutMode } from "@/src/lib/meetings/client/layout";
import { cn } from "@/src/lib/utils";
import { LayoutPicker } from "./layout-picker";
import { MENU_SURFACE, MenuDivider, MenuLabel, MenuRow } from "./menu-row";
import { CALL_SHORTCUTS, shortcutKeyList } from "./shortcut";

/** A phone-sheet tile: icon, label, and an optional corner mark (count or tag). */
export type MoreTile = { id: string; label: string; icon: ReactNode; onSelect: () => void; badge?: ReactNode };
/** A desktop menu row. */
export type MoreRowItem = { id: string; label: string; icon: ReactNode; onSelect: () => void };

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";

const SHORTCUT_LEGEND = [
  { combo: CALL_SHORTCUTS.mic, label: "Mic" },
  { combo: CALL_SHORTCUTS.camera, label: "Camera" },
  { combo: CALL_SHORTCUTS.hand, label: "Hand" },
  { combo: CALL_SHORTCUTS.chat, label: "Chat" }
];

function ShortcutLegend() {
  return (
    <div>
      <MenuLabel>Shortcuts</MenuLabel>
      <ul aria-label="Keyboard shortcuts" className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pb-2 pt-1 text-xs text-muted-foreground">
        {SHORTCUT_LEGEND.map((item) => (
          <li key={item.combo} className="flex items-center gap-2">
            <span className="flex gap-0.5">
              {shortcutKeyList(item.combo).map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Tiles sit three to a row on a 6-column grid; the last row's tiles widen to fill it (one tile →
 * full width, two → halves), so 6, 7 or 8 tiles never leave a ragged row.
 */
const TILE_SPAN = { 1: "col-span-6", 2: "col-span-3", 3: "col-span-2" } as const;

function tileSpan(index: number, count: number) {
  const lastRowStart = count - (count % 3 || 3);
  const inLastRow = index >= lastRowStart ? count - lastRowStart : 3;
  return TILE_SPAN[inLastRow as 1 | 2 | 3];
}

function ActionTile({ tile, span, onSelect }: { tile: MoreTile; span: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        span,
        "relative flex h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-md bg-[var(--ink-3)] px-1 text-xs text-foreground transition-colors hover:bg-[var(--ink-4)] [&_svg]:size-5 [&_svg]:shrink-0",
        FOCUS
      )}
    >
      {tile.icon}
      <span className="line-clamp-2 max-w-full text-center leading-tight">{tile.label}</span>
      {tile.badge ? <span className="absolute right-1.5 top-1.5 flex gap-1">{tile.badge}</span> : null}
    </button>
  );
}

/**
 * More. Desktop: a menu (LAYOUT, then one group of rows: self view, audio and video settings,
 * Meeting details, Host settings for hosts; then the keyboard shortcuts). Phones: a bottom sheet
 * with reactions, one grid of action tiles, then the layout.
 */
export function MoreMenu({
  open,
  onOpenChange,
  trigger,
  mobile,
  layout,
  onLayout,
  layoutAlone,
  onReact,
  tiles = [],
  rows = []
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  mobile: boolean;
  layout: LayoutMode;
  onLayout: (mode: LayoutMode) => void;
  /** 0–1 tiles on stage: every layout looks the same. */
  layoutAlone: boolean;
  /** Phones: the reactions row (desktop has its own React button). */
  onReact?: (emoji: MeetingReaction) => void;
  tiles?: readonly MoreTile[];
  rows?: readonly MoreRowItem[];
}) {
  const run = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  if (mobile) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <DialogPrimitive.Content
            onOpenAutoFocus={pointerSafeAutoFocus}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] space-y-3 overflow-y-auto overscroll-contain border-t border-[var(--ink-4)] bg-[var(--ink-2)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3 outline-none"
          >
            <DialogPrimitive.Title className="sr-only">More options</DialogPrimitive.Title>
            {onReact ? (
              <div role="group" aria-label="Reactions" className="grid grid-cols-8 gap-1 border-b border-[var(--ink-4)] pb-3">
                {MEETING_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`React ${emoji}`}
                    onClick={run(() => onReact(emoji))}
                    className={cn("flex h-11 items-center justify-center rounded-md text-2xl hover:bg-[var(--ink-3)]", FOCUS)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-6 gap-2">
              {tiles.map((tile, index) => (
                <ActionTile key={tile.id} tile={tile} span={tileSpan(index, tiles.length)} onSelect={run(tile.onSelect)} />
              ))}
            </div>
            <div className="-mx-1.5">
              <MenuLabel>Layout</MenuLabel>
              <LayoutPicker layout={layout} onLayout={onLayout} alone={layoutAlone} size="touch" />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          onOpenAutoFocus={pointerSafeAutoFocus}
          side="top"
          align="end"
          sideOffset={12}
          collisionPadding={16}
          className={cn(MENU_SURFACE, "max-h-[min(40rem,calc(100dvh-6rem))] w-80 overflow-y-auto overscroll-contain")}
        >
          <MenuLabel>Layout</MenuLabel>
          <LayoutPicker layout={layout} onLayout={onLayout} alone={layoutAlone} />
          {rows.length > 0 ? <MenuDivider /> : null}
          {rows.map((row) => (
            <MenuRow key={row.id} icon={row.icon} title={row.label} onSelect={run(row.onSelect)} />
          ))}
          <MenuDivider />
          <ShortcutLegend />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
