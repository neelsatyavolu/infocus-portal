"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STAGE_FEEDBACK_READ_EVENT } from "@/src/lib/package-stage-comments";
import { EXTENSION_REQUESTS_CHANGED_EVENT } from "@/src/lib/package-extensions";
import {
  EMPTY_NAV_STATUS,
  NAV_STATUS_CHANGED_EVENT,
  NAV_STATUS_FIELD,
  NAV_STATUS_FRESH_MS,
  NAV_STATUS_PARTS,
  navStatusRequestGroups,
  PAGE_STATUS_EVENTS,
  type NavStatus,
  type NavStatusPart,
  type NavStatusResponse
} from "@/src/lib/sidebar-nav";

/** How often a live meeting is re-checked while the tab is visible, so LIVE never goes stale. */
const MEETINGS_POLL_MS = 60_000;

function isPart(value: unknown): value is NavStatusPart {
  return typeof value === "string" && (NAV_STATUS_PARTS as readonly string[]).includes(value);
}

/** Copies only the fields of the parts that loaded; failed parts keep what they had. */
export function mergeNavStatus(previous: NavStatus, response: NavStatusResponse, applied: NavStatusPart[]): NavStatus {
  return applied.reduce<NavStatus>(
    (next, part) => ({ ...next, [NAV_STATUS_FIELD[part]]: response[NAV_STATUS_FIELD[part]] }),
    previous
  );
}

/** The pending count the Admin page sends with its access-request event, when it is a usable number. */
export function accessRequestsFromEvent(event: Event): number | null {
  const pending = (event as CustomEvent<{ pending?: unknown }>).detail?.pending;
  return typeof pending === "number" && Number.isInteger(pending) && pending >= 0 ? pending : null;
}

/**
 * The sidebar's statuses from GET /api/nav/status. Loaded once; refreshed on route change and
 * tab focus only for parts older than their freshness window. The stage bar's parts (package,
 * extension requests) go in their own request beside the rest, so its locks and statuses show as
 * soon as they load, as with the two requests the shell made before; the stage-feedback, extension,
 * participation and nav-status change events refetch just their parts, and the Admin page's
 * access-request event sets its count directly; a live meeting is re-checked every minute while
 * the tab is visible. Every update is a new object.
 */
export function useNavStatus({
  enabled,
  parts,
  pathname
}: {
  enabled: boolean;
  /** The parts this person's role can see (navStatusPartsFor). */
  parts: NavStatusPart[];
  pathname: string;
}) {
  const [status, setStatus] = useState<NavStatus>(EMPTY_NAV_STATUS);
  const [loaded, setLoaded] = useState<Set<NavStatusPart>>(() => new Set());
  const fetchedAtRef = useRef<Partial<Record<NavStatusPart, number>>>({});
  const requestSeqRef = useRef<Partial<Record<NavStatusPart, number>>>({});
  const seqRef = useRef(0);
  const refreshStaleRef = useRef<(() => void) | null>(null);
  const partsKey = parts.join(",");

  const load = useCallback(
    (requested: NavStatusPart[]) => {
      const allowed = requested.filter((part) => parts.includes(part));
      if (!enabled || allowed.length === 0) return;
      for (const group of navStatusRequestGroups(allowed)) {
        const seq = ++seqRef.current;
        const now = Date.now();
        for (const part of group) {
          fetchedAtRef.current = { ...fetchedAtRef.current, [part]: now };
          requestSeqRef.current = { ...requestSeqRef.current, [part]: seq };
        }
        void fetch(`/api/nav/status?parts=${group.join(",")}`, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) return;
            const body = (await response.json()) as { data?: NavStatusResponse };
            const data = body.data;
            if (!data) return;
            // Apply a part only from its newest request, and never from a failed load.
            const applied = group.filter(
              (part) => requestSeqRef.current[part] === seq && !(data.failed ?? []).includes(part)
            );
            if (applied.length === 0) return;
            setStatus((previous) => mergeNavStatus(previous, data, applied));
            setLoaded((previous) => new Set([...previous, ...applied]));
          })
          .catch(() => {
            /* statuses are best-effort; the next refresh tries again */
          });
      }
    },
    // `parts` is compared through partsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, partsKey]
  );

  useEffect(() => {
    if (!enabled) return;
    const refreshStale = () => {
      const now = Date.now();
      const stale = parts.filter((part) => now - (fetchedAtRef.current[part] ?? 0) >= NAV_STATUS_FRESH_MS[part]);
      load(stale);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshStale();
    };
    const onFeedbackRead = () => load(["package"]);
    const onExtensionsChanged = () => load(["extensions"]);
    const onParticipationChanged = () => load(["people"]);
    // The Admin page already knows the new count: use it, and drop any older admin response in flight.
    const onAccessRequestsChanged = (event: Event) => {
      if (!parts.includes("admin")) return;
      const pending = accessRequestsFromEvent(event);
      if (pending === null) {
        load(["admin"]);
        return;
      }
      fetchedAtRef.current = { ...fetchedAtRef.current, admin: Date.now() };
      requestSeqRef.current = { ...requestSeqRef.current, admin: ++seqRef.current };
      setStatus((previous) => ({ ...previous, accessRequests: pending }));
      setLoaded((previous) => new Set<NavStatusPart>([...previous, "admin"]));
    };
    const onNavStatusChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ parts?: unknown }>).detail;
      const requested = Array.isArray(detail?.parts) ? detail.parts.filter(isPart) : [...parts];
      load(requested);
    };
    const meetingsTimer = parts.includes("meetings")
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") load(["meetings"]);
        }, MEETINGS_POLL_MS)
      : null;

    refreshStaleRef.current = refreshStale;
    // Everything is stale on the first run; coming back from a full-screen page loads only what aged.
    refreshStale();
    window.addEventListener(STAGE_FEEDBACK_READ_EVENT, onFeedbackRead);
    window.addEventListener(EXTENSION_REQUESTS_CHANGED_EVENT, onExtensionsChanged);
    window.addEventListener(PAGE_STATUS_EVENTS.participation, onParticipationChanged);
    window.addEventListener(PAGE_STATUS_EVENTS.accessRequests, onAccessRequestsChanged);
    window.addEventListener(NAV_STATUS_CHANGED_EVENT, onNavStatusChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      refreshStaleRef.current = null;
      if (meetingsTimer !== null) window.clearInterval(meetingsTimer);
      window.removeEventListener(STAGE_FEEDBACK_READ_EVENT, onFeedbackRead);
      window.removeEventListener(EXTENSION_REQUESTS_CHANGED_EVENT, onExtensionsChanged);
      window.removeEventListener(PAGE_STATUS_EVENTS.participation, onParticipationChanged);
      window.removeEventListener(PAGE_STATUS_EVENTS.accessRequests, onAccessRequestsChanged);
      window.removeEventListener(NAV_STATUS_CHANGED_EVENT, onNavStatusChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load]);

  // Declared after the loader above so the first render's fetch is already stamped.
  useEffect(() => {
    refreshStaleRef.current?.();
  }, [pathname]);

  return { status, loaded };
}
