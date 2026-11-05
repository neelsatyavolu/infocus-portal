import type { ReactNode } from "react";
import { statusTagClass, type StatusToneInput } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";

/**
 * Tag sizes, from board tokens:
 * - `rail`: --b-tag, for the right rail and the nameplate.
 * - `lane`: --lane-tag, which follows the race's lane height (never taller than the topic).
 * - `inline`: inside a lane's names line, at the lane tag's size (no larger than the names) with
 *   less padding, so the line keeps its height.
 */
const SIZE_CLASS = {
  rail: "text-[length:var(--b-tag)]! py-[0.25em]! leading-[1.15]",
  lane: "text-[length:var(--lane-tag)]! py-[0.25em]! leading-[1.15]",
  inline: "text-[length:min(var(--lane-tag),var(--lane-meta))]! py-[0.1em]! leading-[1.1]"
} as const;

/**
 * The kit's status tag (`.status-pill` + `.status-*`: 4px radius, caps label, tone tint, the same
 * tones as Groups tiles and the Livestream Tracker), sized in em from a board token so the TV can
 * scale it. `.status-pill` is unlayered CSS, so every override of its own properties (size,
 * padding, gap, alignment, wrapping) needs `!`.
 */
export function BoardTag({
  tone = "neutral",
  size = "rail",
  icon,
  wrap = false,
  title,
  className,
  children
}: {
  tone?: StatusToneInput;
  size?: keyof typeof SIZE_CLASS;
  /** A 1em icon before the words (drawn aria-hidden by the caller). */
  icon?: ReactNode;
  /**
   * Let a long label wrap, up to two lines (the icon stays on the first line). Only race lanes
   * use it: in a lane shorter than 2.15 board units (the lane's height query, board-race.tsx) it
   * keeps to one line.
   */
  wrap?: boolean;
  /** Hover text; defaults to the label when it is plain text. */
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title ?? (typeof children === "string" ? children : undefined)}
      className={cn(
        "status-pill min-w-0 max-w-full shrink-0 gap-[0.4em]! px-[0.55em]! tabular-nums",
        "[&>svg]:size-[1.05em] [&>svg]:shrink-0",
        SIZE_CLASS[size],
        wrap && "items-start! whitespace-normal! text-left",
        statusTagClass(tone),
        className
      )}
    >
      {icon}
      <span
        className={cn(
          "min-w-0",
          wrap ? "line-clamp-2 break-words [@container(max-height:2.15em)]:line-clamp-1" : "truncate"
        )}
      >
        {children}
      </span>
    </span>
  );
}
