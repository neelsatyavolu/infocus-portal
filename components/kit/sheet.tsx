"use client";

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { cn } from "@/src/lib/utils";

const WIDTH: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "md:max-w-sm",
  md: "md:max-w-md",
  lg: "md:max-w-xl",
  xl: "md:max-w-3xl"
};

const SIDE: Record<"right" | "bottom" | "auto", string> = {
  right:
    "inset-y-0 right-0 h-dvh w-full border-l motion-safe:animate-[sheet-in-right_240ms_cubic-bezier(0.16,1,0.3,1)]",
  bottom:
    "inset-x-0 bottom-0 max-h-[92dvh] w-full border-t motion-safe:animate-[sheet-in-bottom_240ms_cubic-bezier(0.16,1,0.3,1)]",
  auto: cn(
    "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[92dvh] max-md:w-full max-md:border-t max-md:motion-safe:animate-[sheet-in-bottom_240ms_cubic-bezier(0.16,1,0.3,1)]",
    "md:inset-y-0 md:right-0 md:h-dvh md:w-full md:border-l md:motion-safe:animate-[sheet-in-right_240ms_cubic-bezier(0.16,1,0.3,1)]"
  )
};

/**
 * A drawer on Radix Dialog: from the right on desktop and from the bottom on phones (`auto`),
 * with a fixed header (eyebrow, H3 title, one line, extras), one scrolling body and a fixed
 * footer for the actions (primary last). Safe-area padding; sits above the phone tab bar.
 * `modal={false}` docks it beside the page (no scrim, page stays usable, page shortcuts keep
 * working) for inspectors; add `dismissOnOutside={false}` so working on the page doesn't close it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  headerExtra,
  footer,
  side = "auto",
  width = "md",
  modal = true,
  dismissOnOutside = true,
  hideClose = false,
  trigger,
  className,
  bodyClassName,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Tags or a small control under the title. */
  headerExtra?: ReactNode;
  /** Buttons for the footer; it lays them out right-aligned at one height. */
  footer?: ReactNode;
  side?: "right" | "bottom" | "auto";
  width?: "sm" | "md" | "lg" | "xl";
  modal?: boolean;
  dismissOnOutside?: boolean;
  /** Hide the close button (e.g. while an upload is running). */
  hideClose?: boolean;
  trigger?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        {modal ? <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" /> : null}
        <DialogPrimitive.Content
          // Without a description, opt out of aria-describedby instead of repeating the title.
          {...(description ? {} : { "aria-describedby": undefined })}
          // Lets page shortcuts (useHotkeys / useListHotkeys) keep working beside a docked sheet.
          data-nonmodal={modal ? undefined : ""}
          onOpenAutoFocus={pointerSafeAutoFocus}
          onInteractOutside={(event) => {
            if (!dismissOnOutside) event.preventDefault();
          }}
          className={cn(
            "fixed z-50 flex flex-col border-border bg-card text-card-foreground outline-none",
            SIDE[side],
            side !== "bottom" && WIDTH[width],
            className
          )}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5">
            <div className="min-w-0 flex-1">
              {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
              <DialogPrimitive.Title className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
              ) : null}
              {headerExtra ? <div className="mt-2 flex flex-wrap items-center gap-2">{headerExtra}</div> : null}
            </div>
            {hideClose ? null : (
              <DialogPrimitive.Close
                aria-label="Close"
                className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </DialogPrimitive.Close>
            )}
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5", bodyClassName)}>{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">
              <ActionBar align="end" fullWidthOnPhone>
                {footer}
              </ActionBar>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
