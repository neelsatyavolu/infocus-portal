"use client";

import { ChevronDown, Loader2, Lock, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { MeetingMenu } from "./meeting-menu";

/**
 * "Start now" with, for execs, a joined chevron menu ("Start private meeting…"). Both halves fill
 * the row height they're given, so the pair matches the buttons beside it. `variant="outline"`
 * when a Join is open below, so that Join stays the one filled button in view.
 */
export function StartMeetingButton({
  starting,
  onStart,
  onStartPrivate,
  variant = "default",
  className
}: {
  starting: boolean;
  onStart: () => void;
  /** Execs only; without it there's no chevron. */
  onStartPrivate?: () => void;
  variant?: "default" | "outline";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0", className)}>
      <Button
        variant={variant}
        onClick={onStart}
        disabled={starting}
        className={cn("h-full flex-1", onStartPrivate && "rounded-r-none")}
      >
        {starting ? <Loader2 className="animate-spin" aria-hidden /> : <Video aria-hidden />}
        Start now
      </Button>
      {onStartPrivate ? (
        <MeetingMenu
          label="More ways to start"
          items={[{ key: "private", label: "Start private meeting…", icon: Lock, onSelect: onStartPrivate }]}
          trigger={
            <Button
              variant={variant}
              aria-label="More ways to start"
              className={cn(
                "h-full rounded-l-none px-2",
                variant === "default" ? "border-l border-[var(--brand-fill-hover)]" : "-ml-px"
              )}
            >
              <ChevronDown aria-hidden />
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
