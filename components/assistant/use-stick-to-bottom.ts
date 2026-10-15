"use client";

import { useEffect, useRef, type RefObject } from "react";
import { NEAR_BOTTOM_PX } from "@/components/assistant/assistant-stream";

/**
 * Keeps a chat scroller pinned to its newest message while the reader is within NEAR_BOTTOM_PX
 * of the bottom. Scrolling up unpins it; set the returned ref to true (on send) to pin it again.
 * `watchKey` re-arms the watcher when the scroller is replaced (panel reopened, chat switched).
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, watchKey: unknown) {
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    const onScroll = () => {
      pinnedRef.current = atBottom();
    };
    const stick = () => {
      if (pinnedRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    };
    const observer = new MutationObserver(stick);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    stick();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref, watchKey]);

  return pinnedRef;
}
