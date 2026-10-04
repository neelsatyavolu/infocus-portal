"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check } from "lucide-react";
import type { LayoutMode } from "@/src/lib/meetings/client/layout";
import { cn } from "@/src/lib/utils";

export type MoreAction = { id: string; label: string; icon: ReactNode; onSelect: () => void; badge?: number };

const LAYOUTS: Array<{ mode: LayoutMode; label: string }> = [
  { mode: "auto", label: "Auto" },
  { mode: "tiled", label: "Tiled" },
  { mode: "spotlight", label: "Spotlight" },
  { mode: "sidebar", label: "Sidebar" }
];

const itemClass =
  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-foreground hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0";

function MenuBody({
  actions,
  layout,
  onLayout,
  close
}: {
  actions: MoreAction[];
  layout: LayoutMode;
  onLayout: (mode: LayoutMode) => void;
  close: () => void;
}) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Layout">
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Layout</p>
        <div className="grid grid-cols-4 gap-1 px-1">
          {LAYOUTS.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={layout === mode}
              onClick={() => onLayout(mode)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]",
                layout === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-[var(--ink-3)]"
              )}
            >
              {layout === mode ? <Check className="h-3 w-3" aria-hidden /> : null}
              {label}
            </button>
          ))}
        </div>
      </div>
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
}) {
  const close = () => onOpenChange(false);
  if (mobile) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto border-t border-[var(--ink-4)] bg-[var(--ink-2)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-2 text-sm"
        >
          <MenuBody {...body} close={close} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
