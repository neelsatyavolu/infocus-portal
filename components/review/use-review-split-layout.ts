"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import { useRememberedState } from "@/components/kit/remembered-state";

export const SPLITTER_WIDTH_PX = 14;
export const MIN_PANEL_WIDTH_PX = 320;
export const MAX_PANEL_WIDTH_PX = 560;
const MIN_PLAYER_WIDTH_PX = 360;
const DEFAULT_PANEL_WIDTH_PX = 420;
const SPLITTER_KEY_STEP_PX = 16;
/** The whole review (header plate + split) never gets shorter than this on a desktop. */
const LAYOUT_MIN_HEIGHT_PX = 480;
/** Tailwind's lg: the split classes in components/review/* use lg: / max-lg: to match. */
const SPLIT_LAYOUT_MIN_WIDTH_PX = 1024;

function isPanelWidth(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

type LayoutRefs = {
  /** Header plate + split: gets the fitted height and the visual-viewport CSS vars. */
  root: RefObject<HTMLDivElement | null>;
  /** The player | splitter | panel grid. */
  split: RefObject<HTMLDivElement | null>;
  /** The player card (stage + control bar); fills its column in the split. */
  card: RefObject<HTMLDivElement | null>;
  /** The media stage inside the card (its max-width is computed). */
  stage: RefObject<HTMLDivElement | null>;
  controls: RefObject<HTMLDivElement | null>;
};

/**
 * Desktop split layout (≥1024px): the review fills the viewport below the app header, the panel
 * width follows the picture (so a 16:9 video fills the height) until the reviewer drags or
 * arrow-keys the splitter, and that width is remembered (saved once per drag, when it ends).
 * Below the split the visual viewport's offsets are published as --review-vv-top /
 * --review-vv-bottom so the pinned player and the docked composer follow an on-screen keyboard.
 */
export function useReviewSplitLayout({
  refs,
  isImageReview,
  layoutKey,
  isMacDesktopApp
}: {
  refs: LayoutRefs;
  isImageReview: boolean;
  /** Changes when the stage's content changes (version, ready state). */
  layoutKey: string;
  isMacDesktopApp: boolean;
}) {
  const { root, split, card, stage, controls } = refs;
  const dragRef = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const [isDesktopSplitLayout, setIsDesktopSplitLayout] = useState(false);
  const [autoPanelWidthPx, setAutoPanelWidthPx] = useState<number | null>(null);
  const [manualPanelWidthPx, setManualPanelWidthPx] = useRememberedState<number | null>(
    "review:panelWidth:v1",
    null,
    isPanelWidth
  );
  const [mediaStageMaxWidthPx, setMediaStageMaxWidthPx] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  // The width while dragging; saved to the remembered width only when the drag ends.
  const [dragPanelWidthPx, setDragPanelWidthPx] = useState<number | null>(null);
  const [fitHeightPx, setFitHeightPx] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setIsDesktopSplitLayout(window.innerWidth >= SPLIT_LAYOUT_MIN_WIDTH_PX);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // An on-screen keyboard shrinks and pans the visual viewport without resizing the layout that
  // `sticky` measures against. Publish both offsets so the pinned player and docked composer follow.
  useEffect(() => {
    const viewport = window.visualViewport;
    const node = root.current;
    if (!viewport || !node) {
      return;
    }
    const sync = () => {
      const isZoomed = viewport.scale > 1.01;
      const top = isZoomed ? 0 : Math.max(0, viewport.offsetTop);
      const bottom = isZoomed ? 0 : Math.max(0, document.documentElement.clientHeight - viewport.offsetTop - viewport.height);
      node.style.setProperty("--review-vv-top", `${Math.round(top)}px`);
      node.style.setProperty("--review-vv-bottom", `${Math.round(bottom)}px`);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [root]);

  // Fill the viewport below the app header exactly; the CSS calc fallback guesses the header height.
  useEffect(() => {
    if (!isDesktopSplitLayout || isMacDesktopApp) {
      setFitHeightPx(null);
      return;
    }
    const measure = () => {
      const node = root.current;
      if (!node) {
        return;
      }
      const main = node.closest("main");
      const bottomPadding = main ? Number.parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
      const top = node.getBoundingClientRect().top + window.scrollY;
      setFitHeightPx(Math.max(LAYOUT_MIN_HEIGHT_PX, Math.floor(window.innerHeight - top - bottomPadding)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isDesktopSplitLayout, isMacDesktopApp, root]);

  const clampPanelWidth = useCallback(
    (requested: number) => {
      const layoutWidth = split.current?.clientWidth ?? 0;
      const layoutDrivenMax = Math.max(MIN_PANEL_WIDTH_PX, layoutWidth - SPLITTER_WIDTH_PX - MIN_PLAYER_WIDTH_PX);
      const ceiling = Math.min(MAX_PANEL_WIDTH_PX, layoutDrivenMax);
      return Math.max(MIN_PANEL_WIDTH_PX, Math.min(ceiling, requested));
    },
    [split]
  );

  const userPanelWidthPx = dragPanelWidthPx ?? manualPanelWidthPx;
  const effectivePanelWidthPx = userPanelWidthPx ?? autoPanelWidthPx ?? DEFAULT_PANEL_WIDTH_PX;

  const recalculate = useCallback(() => {
    if (!isDesktopSplitLayout) {
      setMediaStageMaxWidthPx((current) => (current === null ? current : null));
      if (userPanelWidthPx === null) {
        setAutoPanelWidthPx((current) => (current === null ? current : null));
      }
      return;
    }

    const layoutNode = split.current;
    const cardNode = card.current;
    const mediaNode = stage.current;
    if (!layoutNode || !cardNode || !mediaNode) {
      return;
    }

    const layoutRect = layoutNode.getBoundingClientRect();
    const cardRect = cardNode.getBoundingClientRect();
    const layoutBottom = layoutRect.top + layoutNode.clientHeight;
    const availableHeight = Math.max(0, layoutBottom - cardRect.top);
    const controlsHeight = isImageReview ? 0 : (controls.current?.getBoundingClientRect().height ?? 0);
    const mediaGap = isImageReview ? 0 : 12;
    // The card's own padding and border (it fills the column, so its height can't be used).
    const cardStyle = window.getComputedStyle(cardNode);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const leftChromeHeight =
      px(cardStyle.paddingTop) + px(cardStyle.paddingBottom) + px(cardStyle.borderTopWidth) + px(cardStyle.borderBottomWidth);
    const stageAvailableHeight = Math.max(0, availableHeight - leftChromeHeight);
    const targetVideoHeight = isImageReview ? stageAvailableHeight : Math.max(0, stageAvailableHeight - controlsHeight - mediaGap);
    const targetMediaWidth = Math.max(260, targetVideoHeight * (16 / 9));

    if (userPanelWidthPx === null) {
      const candidate = clampPanelWidth(layoutNode.clientWidth - SPLITTER_WIDTH_PX - targetMediaWidth);
      setAutoPanelWidthPx((current) => (current !== null && Math.abs(current - candidate) < 1 ? current : candidate));
    }

    const activePanelWidth = userPanelWidthPx ?? autoPanelWidthPx ?? clampPanelWidth(DEFAULT_PANEL_WIDTH_PX);
    const availableLeftWidth = Math.max(260, layoutNode.clientWidth - SPLITTER_WIDTH_PX - activePanelWidth);
    const clampedMediaWidth = Math.max(260, Math.min(availableLeftWidth, targetMediaWidth));
    setMediaStageMaxWidthPx((current) =>
      current !== null && Math.abs(current - clampedMediaWidth) < 1 ? current : clampedMediaWidth
    );
  }, [autoPanelWidthPx, card, clampPanelWidth, controls, isDesktopSplitLayout, isImageReview, userPanelWidthPx, split, stage]);

  useEffect(() => {
    recalculate();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => recalculate()) : null;
    for (const node of [split.current, card.current, stage.current, controls.current]) {
      if (observer && node) {
        observer.observe(node);
      }
    }
    window.addEventListener("resize", recalculate);
    return () => {
      window.removeEventListener("resize", recalculate);
      observer?.disconnect();
    };
  }, [layoutKey, recalculate, split, card, stage, controls]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        drag.width = clampPanelWidth(drag.startWidth - (event.clientX - drag.startX));
        setDragPanelWidthPx(drag.width);
      }
    };
    const endResize = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag) {
        setManualPanelWidthPx(drag.width);
      }
      setDragPanelWidthPx(null);
      setIsResizing(false);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
    };
  }, [clampPanelWidth, isResizing, setManualPanelWidthPx]);

  const onSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isDesktopSplitLayout || event.button !== 0) {
        return;
      }
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: effectivePanelWidthPx, width: effectivePanelWidthPx };
      setDragPanelWidthPx(effectivePanelWidthPx);
      setIsResizing(true);
    },
    [effectivePanelWidthPx, isDesktopSplitLayout]
  );

  /** ← widens the panel (the divider moves left), → narrows it. */
  const onSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? SPLITTER_KEY_STEP_PX : -SPLITTER_KEY_STEP_PX;
      setManualPanelWidthPx(clampPanelWidth(effectivePanelWidthPx + delta));
    },
    [clampPanelWidth, effectivePanelWidthPx, setManualPanelWidthPx]
  );

  const resetPanelWidth = useCallback(() => setManualPanelWidthPx(null), [setManualPanelWidthPx]);

  const rootStyle: CSSProperties | undefined =
    isDesktopSplitLayout && fitHeightPx !== null ? { height: `${fitHeightPx}px` } : undefined;
  const splitStyle: CSSProperties | undefined = isDesktopSplitLayout
    ? {
        gridTemplateColumns: `minmax(0,1fr) ${SPLITTER_WIDTH_PX}px minmax(${MIN_PANEL_WIDTH_PX}px, ${Math.round(effectivePanelWidthPx)}px)`
      }
    : undefined;

  return {
    isDesktopSplitLayout,
    isResizing,
    mediaStageMaxWidthPx,
    panelWidthPx: Math.round(effectivePanelWidthPx),
    rootStyle,
    splitStyle,
    onSplitterPointerDown,
    onSplitterKeyDown,
    resetPanelWidth
  };
}
