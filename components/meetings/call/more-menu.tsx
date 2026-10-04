"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MEETING_REACTIONS, type MeetingReaction } from "@/src/lib/meetings/protocol";
import type { LayoutMode } from "@/src/lib/meetings/client/layout";
import { LayoutPicker } from "./layout-picker";

export type MoreAction = { id: string; label: string; icon: ReactNode; onSelect: () => void; badge?: number };

const itemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-foreground hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0";

function MenuBody({
  actions,
  layout,
  onLayout,
  layoutAlone,
  onReact,
  close
}: {
  actions: MoreAction[];
  layout: LayoutMode;
  onLayout: (mode: LayoutMode) => void;
  layoutAlone: boolean;
  onReact?: (emoji: MeetingReaction) => void;
  close: () => void;
}) {
  return (
    <div className="space-y-2">
      {onReact ? (
        <div className="flex flex-wrap justify-between gap-1 border-b border-[var(--ink-4)] pb-2" aria-label="Reactions">
          {MEETING_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React ${emoji}`}
              onClick={() => {
                close();
                onReact(emoji);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-md text-2xl hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <LayoutPicker layout={layout} onLayout={onLayout} alone={layoutAlone} />
      <div className="border-t border-[var(--ink-4)] pt-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={itemClass}
            onClick={() => {
              close();
              action.onSelect();
            }}
          >
            {action.icon}
            <span className="flex-1">{action.label}</span>
            {action.badge ? (
              <span className="rounded-sm bg-primary px-1.5 font-mono text-[11px] tabular-nums text-primary-foreground">{action.badge}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MoreMenu({
  open,
  onOpenChange,
  trigger,
  mobile,
  ...body
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  mobile: boolean;
  actions: MoreAction[];
  layout: LayoutMode;
  onLayout: (mode: LayoutMode) => void;
  /** 0–1 tiles on stage: every layout looks the same. */
  layoutAlone: boolean;
  onReact?: (emoji: MeetingReaction) => void;
}) {
  const close = () => onOpenChange(false);
  if (mobile) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <DialogPrimitive.Content onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto overscroll-contain border-t border-[var(--ink-4)] bg-[var(--ink-2)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
            <DialogPrimitive.Title className="sr-only">More options</DialogPrimitive.Title>
            <MenuBody {...body} close={close} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content onOpenAutoFocus={pointerSafeAutoFocus}
          side="top"
          align="end"
          sideOffset={8}
          className="z-50 outline-none w-72 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-2 text-sm"
        >
          <MenuBody {...body} close={close} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
