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

type Snapshot = {
  me: PlatformMe;
  roles: RoleAssignment[];
  users: PlatformUser[];
  requests: PlatformAccessRequest[];
  cyclesPerSemester: number;
  stats: PlatformStats | null;
  backups: BackupStatus | null;
};

type RefreshOptions = { pageLoader?: boolean; includeStats?: boolean };

function pendingCount(requests: PlatformAccessRequest[]) {
  return requests.filter((entry) => entry.status === "PENDING").length;
}

/**
 * Everything Admin loads up front: who you are, roles, people, access requests, cycles per
 * semester, platform totals (in the background) and backups (adviser and super admin). The last
 * copy shows at once on a return visit while a quiet refresh runs.
 */
export function useAdminData() {
  const [initial] = useState(() => (typeof window === "undefined" ? undefined : cachedValue<Snapshot>(CACHE_KEY)));
  const [me, setMe] = useState<PlatformMe | null>(initial?.me ?? null);
  const [roles, setRoles] = useState<RoleAssignment[]>(initial?.roles ?? []);
  const [users, setUsers] = useState<PlatformUser[]>(initial?.users ?? []);
  const [requests, setRequests] = useState<PlatformAccessRequest[]>(initial?.requests ?? []);
  const [cyclesPerSemester, setCyclesPerSemester] = useState(initial?.cyclesPerSemester ?? 3);
  const [stats, setStats] = useState<PlatformStats | null>(initial?.stats ?? null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupStatus | null>(initial?.backups ?? null);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(Boolean(initial));
  const [loading, setLoading] = useState(!initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const startedRef = useRef(false);
  /** The load error the banner is showing, so a later successful load can take it down. */
  const loadErrorRef = useRef<string | null>(null);

  const loadBackups = useCallback(async () => {
    setBackupsError(null);
    try {
      setBackups(await getData<BackupStatus>("/api/platform/backups"));
    } catch (error) {
      // Shown in the Backups section (with Try again), not repeated in the page banner.
      setBackupsError(errorText(error, "Failed to load backups."));
    }
  }, []);

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      const pageLoader = options?.pageLoader ?? true;
      const includeStats = options?.includeStats ?? true;
      if (pageLoader) {
        setLoading(true);
      }

      try {
        const nextMe = await getData<PlatformMe>("/api/platform/me");
        setMe(nextMe);

        if (nextMe.permissions.canManageAllowedEmails) {
          if (includeStats) {
            void getData<PlatformStats>("/api/platform/stats")
              .then((nextStats) => {
                setStats(nextStats);
                setStatsError(null);
              })
              // Shown once under Platform totals, not repeated in the page banner.
              .catch((error) => setStatsError(errorText(error, "Failed to load admin stats.")));
          }

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
      } catch (error) {
        const text = errorText(error, "Failed to load admin data.");
        loadErrorRef.current = text;
        setLoadError(text);
        setMessage(text);
      } finally {
        if (pageLoader) {
          setLoading(false);
        }
      }
    },
    [loadBackups]
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void refresh({ pageLoader: !initial, includeStats: true });
  }, [initial, refresh]);

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
