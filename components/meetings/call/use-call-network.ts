"use client";

import { useEffect } from "react";
import { diagEvent } from "@/src/lib/meetings/client/diagnostics";

/**
 * Network change and wake-up: Wi-Fi switches, VPNs and a laptop waking from sleep leave the room
 * socket half-dead (no error, no close). On `online`, the tab becoming visible and `pageshow`
 * (back/forward cache), probe the socket: a ping that isn't answered in 5 s reopens it at once.
 */
export function useCallNetwork(probe: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onOnline = () => {
      diagEvent("network", { event: "online" });
      probe();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") probe();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) diagEvent("network", { event: "pageshow" });
      probe();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [probe, active]);
}
