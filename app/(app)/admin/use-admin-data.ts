"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { announceAccessRequests } from "./admin-events";
import {
  errorText,
  getData,
  type BackupStatus,
  type PlatformAccessRequest,
  type PlatformMe,
  type PlatformStats,
  type PlatformUser,
  type RoleAssignment
} from "./admin-types";

/** In memory only (src/lib/client-cache.ts): AppShell clears it when the signed-in person changes. */
const CACHE_KEY = "admin:data";

/** What the page loads on the server (page.tsx): who you are and, for admins, the lists. */
export type AdminInitialData = {
  me: PlatformMe;
  roles: RoleAssignment[];
  users: PlatformUser[];
  requests: PlatformAccessRequest[];
  cyclesPerSemester: number;
};

type Snapshot = AdminInitialData & {
  stats: PlatformStats | null;
  backups: BackupStatus | null;
};

type RefreshOptions = { pageLoader?: boolean; includeStats?: boolean };

function pendingCount(requests: PlatformAccessRequest[]) {
  return requests.filter((entry) => entry.status === "PENDING").length;
}

/**
 * Everything Admin loads up front: who you are, roles, people, access requests, cycles per
 * semester, platform totals (in the background) and backups (adviser and super admin). The server
 * sends who you are and the lists (page.tsx); totals and backups load after hydration, with the
 * last copy of the totals shown at once. Without the server's copy, the last copy of everything
 * shows at once on a return visit while a quiet refresh runs.
 */
export function useAdminData(initialData: AdminInitialData | null) {
  const [initial] = useState<Snapshot | undefined>(() => {
    const cached = typeof window === "undefined" ? undefined : cachedValue<Snapshot>(CACHE_KEY);
    if (!initialData) return cached;
    return { ...initialData, stats: cached?.stats ?? null, backups: cached?.backups ?? null };
  });
  const [me, setMe] = useState<PlatformMe | null>(initial?.me ?? null);
  const [roles, setRoles] = useState<RoleAssignment[]>(initial?.roles ?? []);
  const [users, setUsers] = useState<PlatformUser[]>(initial?.users ?? []);
  const [requests, setRequests] = useState<PlatformAccessRequest[]>(initial?.requests ?? []);
  const [cyclesPerSemester, setCyclesPerSemester] = useState(initial?.cyclesPerSemester ?? 3);
  const [stats, setStats] = useState<PlatformStats | null>(initial?.stats ?? null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupStatus | null>(initial?.backups ?? null);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(
    initialData ? initialData.me.permissions.canManageAllowedEmails : Boolean(initial)
  );
  const [loading, setLoading] = useState(!initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const startedRef = useRef(false);
  /** Who you are, once known (server or API): later refreshes skip GET /api/platform/me. */
  const meRef = useRef<PlatformMe | null>(initialData?.me ?? null);
  /** The load error the banner is showing, so a later successful load can take it down. */
  const loadErrorRef = useRef<string | null>(null);

  const fetchBackups = useCallback(
    () =>
      getData<BackupStatus>("/api/platform/backups").then(setBackups, (error) => {
        // Shown in the Backups section (with Try again), not repeated in the page banner.
        setBackupsError(errorText(error, "Failed to load backups."));
      }),
    []
  );

  const loadBackups = useCallback(async () => {
    setBackupsError(null);
    await fetchBackups();
  }, [fetchBackups]);

  const loadStats = useCallback(() => {
    void getData<PlatformStats>("/api/platform/stats")
      .then((nextStats) => {
        setStats(nextStats);
        setStatsError(null);
      })
      // Shown once under Platform totals, not repeated in the page banner.
      .catch((error) => setStatsError(errorText(error, "Failed to load admin stats.")));
  }, []);

  /** Loads everything; the caller shows the page loader first (`loading` starts true when it is needed). */
  const loadAll = useCallback(
    (pageLoader: boolean, includeStats: boolean) =>
      Promise.resolve(meRef.current ?? getData<PlatformMe>("/api/platform/me"))
        .then(async (nextMe) => {
          meRef.current = nextMe;
          setMe(nextMe);

          if (nextMe.permissions.canManageAllowedEmails) {
            if (includeStats) loadStats();

            const [nextRoles, nextUsers, nextRequests, program] = await Promise.all([
              getData<RoleAssignment[]>("/api/platform/roles"),
              getData<PlatformUser[]>("/api/platform/users"),
              getData<PlatformAccessRequest[]>("/api/platform/access-requests"),
              getData<{ cyclesPerSemester: number }>("/api/platform/program-settings")
            ]);

            setCyclesPerSemester(program.cyclesPerSemester);
            setRoles(nextRoles);
            setUsers(nextUsers);
            setRequests(nextRequests);
            setListsLoaded(true);
            announceAccessRequests(pendingCount(nextRequests));
          }

          if (nextMe.permissions.canManagePlatformRoles) {
            await loadBackups();
          } else {
            setBackups(null);
            setBackupsError(null);
          }
          // Loaded: clear an earlier load failure (Try again) unless something else replaced its banner.
          const staleError = loadErrorRef.current;
          loadErrorRef.current = null;
          setLoadError(null);
          if (staleError) {
            setMessage((current) => (current === staleError ? null : current));
          }
        })
        .catch((error) => {
          const text = errorText(error, "Failed to load admin data.");
          loadErrorRef.current = text;
          setLoadError(text);
          setMessage(text);
        })
        .finally(() => {
          if (pageLoader) {
            setLoading(false);
          }
        }),
    [loadBackups, loadStats]
  );

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      const pageLoader = options?.pageLoader ?? true;
      if (pageLoader) {
        setLoading(true);
      }
      await loadAll(pageLoader, options?.includeStats ?? true);
    },
    [loadAll]
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialData) {
      // The lists came with the page; only the totals and backups are left to load.
      if (initialData.me.permissions.canManageAllowedEmails) {
        announceAccessRequests(pendingCount(initialData.requests));
        loadStats();
      }
      // No earlier backups error to clear on the first load.
      if (initialData.me.permissions.canManagePlatformRoles) void fetchBackups();
      return;
    }
    // `loading` already starts as !initial, so no page-loader reset is needed here.
    void loadAll(!initial, true);
  }, [initial, initialData, fetchBackups, loadStats, loadAll]);

  useEffect(() => {
    if (!me || !listsLoaded) return;
    rememberValue<Snapshot>(CACHE_KEY, { me, roles, users, requests, cyclesPerSemester, stats, backups });
  }, [me, roles, users, requests, cyclesPerSemester, stats, backups, listsLoaded]);

  const updateUser = useCallback((updated: PlatformUser) => {
    setUsers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
  }, []);

  const removeUser = useCallback((userId: string) => {
    setUsers((current) => current.filter((entry) => entry.id !== userId));
    setStats((current) =>
      current ? { ...current, totals: { ...current.totals, users: Math.max(0, current.totals.users - 1) } } : current
    );
  }, []);

  return {
    me,
    roles,
    users,
    requests,
    pendingRequests: pendingCount(requests),
    cyclesPerSemester,
    setCyclesPerSemester,
    stats,
    statsError,
    backups,
    backupsError,
    loadBackups,
    listsLoaded,
    loading,
    loadError,
    message,
    setMessage,
    refresh,
    updateUser,
    removeUser
  };
}
