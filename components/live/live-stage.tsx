"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./live.css";

export const LIVE_ICON_SRC = "/live/infocus-icon.png";
export const LIVE_WORDMARK_SRC = "/live/infocus-wordmark-white.png";

/** A 1920 × 1080 broadcast stage scaled to the width of its container. */
export function LiveStage({
  children,
  background = "transparent",
  className = ""
}: {
  children: ReactNode;
  background?: "transparent" | "checker" | "ink";
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(frame.clientWidth / 1920);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const backgroundClass = background === "checker" ? "lv-checker" : background === "ink" ? "bg-[#0F110F]" : "";

  return (
    <div ref={frameRef} className={`lv-frame ${backgroundClass} ${className}`}>
      <div className="lv-stage" style={{ transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/** Keeps a server-aligned clock ticking for anything that shows time. */
export function useLiveNow(offsetMs: number, intervalMs = 100) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => window.clearInterval(id);
  }, [offsetMs, intervalMs]);
  return now;
}

/**
 * Server clock offset from request samples. Keeps the sample with the shortest round trip, the
 * most accurate one, and only replaces it with a faster one, so the clock neither drifts nor jitters.
 */
export function useServerOffset() {
  const [offset, setOffset] = useState(0);
  const bestRtt = useRef(Number.POSITIVE_INFINITY);
  const sample = useCallback((sentAt: number, receivedAt: number, serverNow: number) => {
    const rtt = receivedAt - sentAt;
    if (rtt >= bestRtt.current) return;
    bestRtt.current = rtt;
    setOffset(Math.round(serverNow - (sentAt + receivedAt) / 2));
  }, []);
  return { offset, sample };
}
