"use client";

import { forwardRef, type KeyboardEvent } from "react";
import { Lock, MapPin, Send } from "lucide-react";
import { KeyHints } from "@/components/kit/kbd";
import { Spinner } from "@/components/kit/spinner";
import { PlayheadTimecode, type ValueStore } from "@/components/review-playhead";
import { Button } from "@/components/ui/button";
import { AutoGrowTextarea } from "@/components/review/auto-grow-textarea";
import { formatPinLabel } from "@/components/review/comment-utils";
import { isCoarsePointer, shouldEnterSend } from "@/src/lib/enter-to-send";
import { cn } from "@/src/lib/utils";

/**
 * Below the split, in portrait, the composer docks to the bottom of the screen: above the phone
 * tab bar and above an on-screen keyboard, whichever is higher. Safe-area padding only applies
 * when nothing sits under it.
 */
const DOCKED_CLASS =
  "max-lg:portrait:sticky max-lg:portrait:bottom-[max(var(--review-vv-bottom,0px),var(--phone-tabbar-h,0px))] max-lg:portrait:z-[46] max-lg:portrait:pb-[max(0.5rem,calc(env(safe-area-inset-bottom)_-_var(--phone-tabbar-h,0px)))]";
/**
 * Keeps the composer clear of the floating ✱ Assistant button (48px, 20px from the corner): the
 * whole docked composer below the split, and the Send row in the desktop split, where the panel
 * ends 24px above the bottom of the screen.
 */
const LAUNCHER_GUTTER_CLASS = "max-lg:portrait:pr-[3.75rem]";
const LAUNCHER_ROW_GUTTER_CLASS = "lg:pr-12";
const TAG_CLASS =
  "inline-flex h-6 min-w-0 shrink-0 items-center gap-1 rounded-sm bg-[var(--brand-green)]/12 px-1.5 font-mono-broadcast text-[11px] font-medium tabular-nums text-[var(--brand-green)]";
/** "Enter Send · Shift Enter New line" needs about this much room beside the tag and Send. */
const HINTS_CLASS = "hidden min-w-0 flex-nowrap overflow-hidden @min-[29rem]:group-focus-within/composer:flex";
const DESKTOP_MAX_HEIGHT_PX = 160;
const TOUCH_MAX_HEIGHT_PX = 4 * 20 + 18;

type ComposerProps = {
  kind: "timeline" | "general";
  isImageReview: boolean;
  pin: { xPct: number; yPct: number } | null;
  playhead: ValueStore<number>;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  /** Filled (primary) only when the page has no other primary button. */
  primary: boolean;
  /** Touch layout: one row, icon Send, no keyboard hints. */
  touch: boolean;
  avoidLauncher: boolean;
};

function ContextTag({ isImageReview, pin, playhead }: Pick<ComposerProps, "isImageReview" | "pin" | "playhead">) {
  if (isImageReview) {
    return (
      <span className={cn(TAG_CLASS, "shrink")}>
        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">
          {pin ? formatPinLabel(pin.xPct, pin.yPct).replace("Point", "Pin") : "Click the image to place a pin"}
        </span>
      </span>
    );
  }
  return (
    <span className={TAG_CLASS}>
      @ <PlayheadTimecode playhead={playhead} frameAccurate />
    </span>
  );
}

/**
 * The new-comment box at the bottom of the comments panel (Timeline and General tabs). Desktop:
 * the box, then one row with the playhead (or pin) tag, the key hints while writing (when the
 * panel is wide enough) and Send. Touch: one row with an icon Send; the tag shows while writing.
 */
export const CommentComposer = forwardRef<HTMLTextAreaElement, ComposerProps>(function CommentComposer(
  { kind, isImageReview, pin, playhead, value, onChange, onSend, sending, primary, touch, avoidLauncher },
  ref
) {
  const timeline = kind === "timeline";
  const needsPin = timeline && isImageReview && !pin;
  const canSend = !sending && value.trim().length > 0 && !needsPin;
  const placeholder = timeline
    ? isImageReview
      ? pin
        ? "Comment on this pin…"
        : touch
          ? "Tap the image to place a pin"
          : "Comment on this pin…"
      : "Comment at this moment…"
    : "Leave a general comment…";

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldEnterSend({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }, isCoarsePointer())) {
      return;
    }
    event.preventDefault();
    if (canSend) {
      onSend();
    }
  };

  const textarea = (
    <AutoGrowTextarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      data-review-composer
      rows={touch ? 1 : 2}
      maxHeightPx={touch ? TOUCH_MAX_HEIGHT_PX : DESKTOP_MAX_HEIGHT_PX}
      placeholder={placeholder}
      aria-label={timeline ? (isImageReview ? "Comment on the image" : "Comment at the playhead") : "General comment"}
      className={cn(
        "resize-none",
        touch ? "min-h-10 py-2" : "min-h-14",
        timeline && "border-[var(--brand-green)]/60 focus-visible:border-[var(--brand-green)]"
      )}
    />
  );

  return (
    <div
      className={cn(
        "group/composer shrink-0 border-t border-border bg-card",
        touch ? "px-4 py-2" : "space-y-2 px-4 py-3",
        DOCKED_CLASS,
        avoidLauncher && LAUNCHER_GUTTER_CLASS
      )}
    >
      {touch && timeline ? (
        <div className="mb-2 hidden h-6 items-center group-focus-within/composer:flex">
          <ContextTag isImageReview={isImageReview} pin={pin} playhead={playhead} />
        </div>
      ) : null}
      {touch ? (
        <div className={cn("flex items-end gap-2", avoidLauncher && LAUNCHER_ROW_GUTTER_CLASS)}>
          {textarea}
          <Button
            type="button"
            size="icon"
            variant={primary ? "default" : "secondary"}
            className="h-10 w-10 shrink-0"
            onClick={onSend}
            disabled={!canSend}
            aria-label={timeline ? "Send comment" : "Send general comment"}
          >
            {sending ? <Spinner /> : <Send aria-hidden />}
          </Button>
        </div>
      ) : (
        <>
          {textarea}
          <div className={cn("@container flex min-h-9 items-center gap-3", avoidLauncher && LAUNCHER_ROW_GUTTER_CLASS)}>
            {timeline ? (
              <>
                <ContextTag isImageReview={isImageReview} pin={pin} playhead={playhead} />
                <KeyHints
                  showOnTouch
                  className={HINTS_CLASS}
                  items={[
                    { keys: ["Enter"], label: "Send" },
                    { keys: ["Shift", "Enter"], label: "New line" }
                  ]}
                />
              </>
            ) : (
              <p className="min-w-0 text-xs text-muted-foreground">General feedback about this {isImageReview ? "image" : "video"}.</p>
            )}
            <Button
              type="button"
              variant={primary ? "default" : "secondary"}
              className="ml-auto h-9 shrink-0"
              onClick={onSend}
              disabled={!canSend}
              title="Send (Enter). Shift+Enter adds a new line."
            >
              {sending ? <Spinner /> : <Send aria-hidden />}
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
});

/** Shown instead of the composer when this viewer can't comment. Not docked. */
export function ComposerClosed({ isGuest }: { isGuest: boolean }) {
  return (
    <p className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      {isGuest ? "This link is view-only." : "Associate review closes after Stage 1."}
    </p>
  );
}
