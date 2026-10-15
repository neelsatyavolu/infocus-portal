"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  errorText,
  readJson,
  type EquipmentItem,
  type HubUser,
  type ManagerRow,
  type RequestRow
} from "@/components/equipment/equipment-api";

/** One Manage tab = one resource; Overdue is a filter of Out. */
export type ManageResource = "out" | "requests" | "inventory" | "settings";

export type ManageSettings = {
  managers: ManagerRow[];
  users: HubUser[];
  canAppoint: boolean;
  /** The member roster failed to load, so `users` is empty for that reason, not because no one matches. */
  rosterFailed: boolean;
};

type Flags = Record<ManageResource, boolean>;
const NO_FLAGS: Flags = { out: false, requests: false, inventory: false, settings: false };
/** Where the tab badges come from: the overdue count (Out) and the pending count (Requests). */
const BADGE_SOURCES: readonly ManageResource[] = ["out", "requests"];

async function fetchItems(url: string) {
  const data = await readJson<{ items: EquipmentItem[] }>(await fetch(url));
  return data.items ?? [];
}

async function fetchRequests() {
  const data = await readJson<{ requests: RequestRow[] }>(await fetch("/api/equipment/manage/requests"));
  return data.requests ?? [];
}

/**
 * Managers and whether this person appoints them, then (producers only) the member roster. As
 * before, a failed roster still shows the managers and their Remove buttons; it only comes back
 * as `rosterError`.
 */
async function fetchSettings(): Promise<{ settings: ManageSettings; rosterError: string | null }> {
  const [managerPayload, me] = await Promise.all([
    fetch("/api/equipment/manage/managers").then((res) => readJson<{ managers: ManagerRow[] }>(res)),
    fetch("/api/platform/me").then((res) => readJson<{ role: string | null }>(res))
  ]);
  const managers = managerPayload.managers ?? [];
  // Producers (any platform role) appoint managers; only they need the member list.
  const canAppoint = Boolean(me.role);
  if (!canAppoint) return { settings: { managers, users: [], canAppoint, rosterFailed: false }, rosterError: null };
  try {
    const roster = await readJson<HubUser[]>(await fetch("/api/platform/users"));
    return {
      settings: { managers, users: Array.isArray(roster) ? roster : [], canAppoint, rosterFailed: false },
      rosterError: null
    };
  } catch (error) {
    return {
      settings: { managers, users: [], canAppoint, rosterFailed: true },
      rosterError: errorText(error, "Could not load members.")
    };
  }
}

/**
 * Manage's data, kept per tab so switching tabs shows the last copy at once and refreshes it
 * quietly. Out and Requests load on mount and on window focus (their counts are the tab badges),
 * and `refresh` reloads them along with the open tab; Inventory and
 * Settings load the first time they are opened. A failed load is kept per resource (`errors`),
 * so a tab that never loaded shows the error instead of placeholders. A newer load always wins
 * over an older one that finishes late.
 */
export function useManageData() {
  const [outItems, setOutItems] = useState<EquipmentItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [inventory, setInventory] = useState<EquipmentItem[]>([]);
  const [settings, setSettings] = useState<ManageSettings>({
    managers: [],
    users: [],
    canAppoint: false,
    rosterFailed: false
  });
  const [loaded, setLoaded] = useState<Flags>(NO_FLAGS);
  const [loading, setLoading] = useState<Flags>(NO_FLAGS);
  const [errors, setErrors] = useState<Partial<Record<ManageResource, string>>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const mounted = useRef(true);
  const sequence = useRef<Record<ManageResource, number>>({ out: 0, requests: 0, inventory: 0, settings: 0 });
  const inflight = useRef<Partial<Record<ManageResource, Promise<void>>>>({});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Fetches one resource and stores it; returns a partial-load message (Settings' roster) or null. */
  const fetchInto = useCallback(async (resource: ManageResource, current: () => boolean): Promise<string | null> => {
    if (resource === "out") {
      const items = await fetchItems("/api/equipment/manage/out");
      if (current()) {
        setOutItems(items);
        setNow(Date.now());
      }
      return null;
    }
    if (resource === "requests") {
      const rows = await fetchRequests();
      if (current()) setRequests(rows);
      return null;
    }
    if (resource === "inventory") {
      const items = await fetchItems("/api/equipment/manage/items");
      if (current()) setInventory(items);
      return null;
    }
    const next = await fetchSettings();
    if (current()) setSettings(next.settings);
    return next.rosterError;
  }, []);

  const run = useCallback(
    async (resource: ManageResource) => {
      const token = ++sequence.current[resource];
      const current = () => mounted.current && token === sequence.current[resource];
      setLoading((prev) => ({ ...prev, [resource]: true }));
      let error: string | null = null;
      try {
        error = await fetchInto(resource, current);
        if (!current()) return;
        setLoaded((prev) => (prev[resource] ? prev : { ...prev, [resource]: true }));
        setUpdatedAt(Date.now());
      } catch (failure) {
        error = errorText(failure, "Could not load.");
      } finally {
        if (current()) {
          setLoading((prev) => ({ ...prev, [resource]: false }));
          setErrors((prev) => {
            const rest = { ...prev };
            delete rest[resource];
            return error ? { ...rest, [resource]: error } : rest;
          });
        }
      }
    },
    [fetchInto]
  );

  /**
   * Loads one resource. A load already on its way is reused unless `force` (after a change,
   * the list must come from after the change).
   */
  const load = useCallback(
    (resource: ManageResource, { force = false }: { force?: boolean } = {}) => {
      const existing = inflight.current[resource];
      if (existing && !force) return existing;
      const promise = run(resource).finally(() => {
        if (inflight.current[resource] === promise) delete inflight.current[resource];
      });
      inflight.current[resource] = promise;
      return promise;
    },
    [run]
  );

  // The tab badges (overdue, pending) come from Out and Requests, so both load on mount and
  // quietly again when the manager comes back to the window (the same pattern as Checkout's
  // session check), so new requests and overdue gear show without opening those tabs.
  useEffect(() => {
    const loadBadges = () => {
      for (const resource of BADGE_SOURCES) void load(resource);
    };
    loadBadges();
    window.addEventListener("focus", loadBadges);
    return () => window.removeEventListener("focus", loadBadges);
  }, [load]);

  /** Refresh: the open tab plus the badge sources, each fetched once and fresh. */
  const refresh = useCallback(
    (tab: ManageResource) => {
      for (const resource of new Set<ManageResource>([tab, ...BADGE_SOURCES])) void load(resource, { force: true });
    },
    [load]
  );

  return { outItems, now, requests, inventory, settings, loaded, loading, errors, updatedAt, load, refresh };
}
