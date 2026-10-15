"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const PHONE_DETAIL_STATE = "peopleMemberDetail";

function onPhoneDetailEntry() {
  try {
    return Boolean((window.history.state as Record<string, unknown> | null)?.[PHONE_DETAIL_STATE]);
  } catch {
    return false;
  }
}

/**
 * The phone drill-in for Members: opening a person gets its own history entry (no URL change), so
 * Back and the iOS back swipe return to the list at the same scroll position. `onLeave` runs
 * whenever the detail closes (a field that disappears never blurs, so it sends pending notes).
 * - Back from another page onto that entry reopens the detail, so the next Back closes it as
 *   usual instead of showing the list twice.
 * - Widening to desktop with the detail open drops its entry.
 */
export function usePhoneDetail({ isDesktop, mounted, onLeave }: { isDesktop: boolean; mounted: boolean; onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const pushedRef = useRef(false);
  const listScrollRef = useRef(0);
  const wasOpenRef = useRef(false);
  const onLeaveRef = useRef(onLeave);

  useEffect(() => {
    onLeaveRef.current = onLeave;
  });

  function openDetail() {
    listScrollRef.current = window.scrollY;
    try {
      window.history.pushState({ [PHONE_DETAIL_STATE]: true }, "");
      pushedRef.current = true;
    } catch {
      pushedRef.current = false;
    }
    setOpen(true);
  }

  function closeDetail() {
    onLeaveRef.current();
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!onPhoneDetailEntry()) return;
    pushedRef.current = true;
    setOpen(true);
  }, []);

  // Waits for mount, since the hydration render always guesses desktop.
  useEffect(() => {
    if (!mounted || !isDesktop || !pushedRef.current) return;
    pushedRef.current = false;
    window.history.back();
  }, [mounted, isDesktop]);

  useEffect(() => {
    if (!open) return;
    function onPopState() {
      pushedRef.current = false;
      onLeaveRef.current();
      setOpen(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);

  useLayoutEffect(() => {
    if (wasOpenRef.current === open) return;
    wasOpenRef.current = open;
    if (isDesktop) return;
    if (open) detailRef.current?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: listScrollRef.current });
  }, [open, isDesktop]);

  return { open, openDetail, closeDetail, detailRef };
}
