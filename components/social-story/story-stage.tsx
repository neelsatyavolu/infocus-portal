"use client";

import { Fragment, useEffect, useRef, useState, type DragEventHandler, type ReactNode, type RefObject } from "react";
import { Eye, SlidersHorizontal } from "lucide-react";
import type { KitIcon } from "@/components/kit/icon";
import { IconButton } from "@/components/kit/icon-button";
import { StatusTag } from "@/components/kit/status-tag";
import { Switch } from "@/components/ui/switch";
import { StoryFrame } from "@/components/story-maker/story-canvas";
import { cn } from "@/src/lib/utils";
import { FIELDS_ID } from "./inspector-section";

export const STAGE_ID = "story-preview";

/**
 * StoryFrame's own width bound (story-canvas.tsx: at least 240px, at most the column and
 * (100dvh − 15rem)·9/16). On phones the frame is narrower than the column and centred, so the
 * status line, switch and hint use the same box and share the frame's edges. From md the column
 * is already that width, so this changes nothing there.
 */
const FRAME_COLUMN = "mx-auto w-full max-w-[max(240px,min(100%,calc((100dvh_-_15rem)*9/16)))]";
/** Below md the action row is a bar fixed above the tab bar. */
const PHONE_QUERY = "(max-width: 767.98px)";
const TOAST_VAR = "--toast-offset-bottom";
/** Space kept between the end of the page and the top of the phone bar. */
const BAR_CLEARANCE_PX = 12;

export type StageTone = "danger" | "warning" | "success" | "neutral";
export type StageStatusItem = {
  key: string;
  tone: StageTone;
  label: string;
  icon?: KitIcon;
  spinner?: boolean;
  /** Hover text, and the full sentence for screen readers. */
  detail?: string;
  /** Makes the tag a quiet link (e.g. jump to the Brand check list). */
  onClick?: () => void;
};

const SEVERITY: Record<StageTone, number> = { danger: 0, warning: 1, success: 2, neutral: 3 };

export function scrollToSection(id: string) {
  const node = document.getElementById(id);
  if (!node) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** True while at least 30% of the node is on screen. */
function useMostlyVisible(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= 0.3), { threshold: [0, 0.3, 0.6] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

/**
 * Sonner reads `--toast-offset-bottom` on <html>. While the action bar is fixed (phones), toasts
 * go above it instead of covering Download; what was there before (the shell's tab-bar offset)
 * comes back when the bar is static again or the page closes.
 */
function useToastsAboveBar(barRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia(PHONE_QUERY);
    let saved: string | null = null;
    const restore = () => {
      if (saved === null) return;
      if (saved) root.style.setProperty(TOAST_VAR, saved);
      else root.style.removeProperty(TOAST_VAR);
      saved = null;
    };
    const apply = () => {
      const bar = barRef.current;
      if (!media.matches || !bar) {
        restore();
        return;
      }
      saved ??= root.style.getPropertyValue(TOAST_VAR);
      const tabBar = getComputedStyle(bar).getPropertyValue("--phone-tabbar-h").trim() || "0px";
      // The bar's own bottom offset, its 48px height, and an 8px gap.
      root.style.setProperty(TOAST_VAR, `calc(${tabBar} + max(1.25rem, env(safe-area-inset-bottom, 0px)) + 3.5rem)`);
    };
    // One frame later, so the shell's offset (set by its own effect in the same commit) is what gets saved.
    const frame = window.requestAnimationFrame(apply);
    media.addEventListener("change", apply);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", apply);
      restore();
    };
  }, [barRef]);
}

type BarFit = {
  /** Bottom room (px) the page must add on phones so its end scrolls clear of the bar. */
  room: number;
  /** Whether the shell shows its ✱ launcher, so the bar keeps a gutter for it. */
  launcher: boolean;
};

/**
 * Measures the phone bar against the shell. The shell pads the bottom of the page for its ✱
 * launcher only when it shows one (app-shell `hasFloatingButton`); the launcher has the bar's
 * bottom offset and height, so that padding covers the bar too. In the iOS app and on sample
 * accounts there is no launcher and the padding is 1.5rem, so the page adds the difference and
 * the bar drops the launcher's gutter. From md the bar is static: no room, gutter irrelevant.
 */
function useBarFit(barRef: RefObject<HTMLElement | null>): BarFit {
  const [fit, setFit] = useState<BarFit>({ room: 0, launcher: true });
  useEffect(() => {
    const bar = barRef.current;
    const main = bar?.closest("main");
    if (!bar || !main) return;
    const media = window.matchMedia(PHONE_QUERY);
    const measure = () => {
      let next: BarFit = { room: 0, launcher: true };
      if (media.matches) {
        const barTop = Number.parseFloat(getComputedStyle(bar).bottom) + bar.offsetHeight;
        const padding = Number.parseFloat(getComputedStyle(main).paddingBottom);
        next = { room: Math.max(0, Math.ceil(barTop + BAR_CLEARANCE_PX - padding)), launcher: padding >= barTop };
      }
      setFit((current) => (current.room === next.room && current.launcher === next.launcher ? current : next));
    };
    // One frame later, so the shell's tab-bar height (set in the same commit) is in place.
    const frame = window.requestAnimationFrame(measure);
    media.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
    };
  }, [barRef]);
  return fit;
}

/**
 * The status slot above the preview: one 24px line of tags, most severe first (never empty: the
 * story's size shows when nothing else applies). The most severe keeps its full width; the others
 * shrink and end in "…" (full text on hover), so the line never wraps and the sticky preview never
 * changes height.
 */
function StageStatus({ items }: { items: StageStatusItem[] }) {
  const sorted = [...items].sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone]);
  return (
    <div role="status" className="flex h-6 min-w-0 items-center gap-1.5 overflow-hidden">
      {sorted.map((item, index) => {
        const fit = index === 0 ? "shrink-0" : "min-w-0 shrink";
        const tag = (
          <StatusTag
            tone={item.tone}
            icon={item.icon}
            spinner={item.spinner}
            title={item.detail ?? item.label}
            srLabel={item.detail ? `${item.detail} ` : undefined}
            className={item.onClick ? "underline-offset-2 group-hover:underline" : fit}
          >
            {item.label}
          </StatusTag>
        );
        return item.onClick ? (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className={cn("group flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", fit)}
          >
            {tag}
          </button>
        ) : (
          <Fragment key={item.key}>{tag}</Fragment>
        );
      })}
    </div>
  );
}

/**
 * The download row. From md it sits above the preview; on phones the same element becomes a
 * 48px bar fixed above the tab bar, level with the ✱ button and clear of it (when the shell shows
 * one), with a jump button that flips between the preview and the fields. It is a size container,
 * so labels can shorten (`@min-[19rem]:`) when the bar is narrow. `onBarRoomChange` gets the
 * bottom room the page must add on phones (see useBarFit).
 */
function StageActions({
  frameRef,
  onBarRoomChange,
  children
}: {
  frameRef: RefObject<HTMLElement | null>;
  onBarRoomChange: (px: number) => void;
  children: ReactNode;
}) {
  const previewOnScreen = useMostlyVisible(frameRef);
  const barRef = useRef<HTMLDivElement>(null);
  useToastsAboveBar(barRef);
  const { room, launcher } = useBarFit(barRef);
  useEffect(() => onBarRoomChange(room), [room, onBarRoomChange]);
  return (
    <div
      ref={barRef}
      className={cn(
        "max-md:pointer-events-none max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(var(--phone-tabbar-h,0px)+max(1.25rem,env(safe-area-inset-bottom)))] max-md:z-30 max-md:pl-4",
        launcher ? "max-md:pr-[calc(max(1.25rem,env(safe-area-inset-right))+3.5rem)]" : "max-md:pr-4"
      )}
    >
      <div
        role="group"
        aria-label="Story actions"
        className="@container pointer-events-auto flex min-w-0 items-center gap-2 max-md:h-12 max-md:gap-1 max-md:rounded-md max-md:border max-md:border-border max-md:bg-card max-md:px-[3px]"
      >
        <IconButton
          label={previewOnScreen ? "Go to the fields" : "Back to the preview"}
          icon={previewOnScreen ? SlidersHorizontal : Eye}
          size="touch"
          tooltip={false}
          className="md:hidden"
          onClick={() => scrollToSection(previewOnScreen ? FIELDS_ID : STAGE_ID)}
        />
        {children}
      </div>
    </div>
  );
}

/**
 * The preview column: download actions, the status line, the 9:16 frame (rendered once and
 * never hidden, because fitting, Custom measuring and the PNG export all need it laid out), the
 * UI-zones switch, and the hint under it. Photos can be dropped anywhere on it (`drop` handlers).
 * `onBarRoomChange`: bottom padding (px) the page needs on phones to clear the fixed action bar.
 */
export function StoryStage({
  actions,
  status,
  hint,
  showSafeZones,
  onShowSafeZonesChange,
  onBarRoomChange,
  dragging,
  drop,
  className,
  children
}: {
  actions: ReactNode;
  status: StageStatusItem[];
  hint?: ReactNode;
  showSafeZones: boolean;
  onShowSafeZonesChange: (next: boolean) => void;
  onBarRoomChange: (px: number) => void;
  dragging: boolean;
  drop: { onDragOver: DragEventHandler; onDragLeave: DragEventHandler; onDrop: DragEventHandler };
  className?: string;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  return (
    <section id={STAGE_ID} aria-label="Preview" className={cn("flex min-w-0 scroll-mt-20 flex-col gap-3", className)} {...drop}>
      <StageActions frameRef={frameRef} onBarRoomChange={onBarRoomChange}>
        {actions}
      </StageActions>
      <div className={cn(FRAME_COLUMN, "flex flex-col gap-3")}>
        <StageStatus items={status} />
        <div ref={frameRef} className={cn("rounded-md", dragging && "outline-dashed outline-2 outline-offset-2 outline-[var(--brand-green)]")}>
          <StoryFrame showSafeZones={showSafeZones}>{children}</StoryFrame>
        </div>
        <div className="grid gap-1">
          <div className="flex h-10 min-w-0 items-center gap-2 md:h-8">
            <Switch id="safe-zones" checked={showSafeZones} onCheckedChange={onShowSafeZonesChange} />
            <label htmlFor="safe-zones" className="min-w-0 flex-1 cursor-pointer truncate text-sm leading-10 text-[var(--ink-text)] md:leading-8">
              Show Instagram’s UI zones
            </label>
          </div>
          {hint ? <p className="text-xs leading-4 text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
    </section>
  );
}
