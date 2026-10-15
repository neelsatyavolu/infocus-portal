"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { requestNavStatusRefresh } from "@/src/lib/sidebar-nav";
import type { CompletionRow, Member, Payload } from "./livestreams-model";
import type { eventPayload } from "./livestreams-form";

const PAYLOAD_KEY = "livestreams";
const MEMBERS_KEY = "livestreams:members";
const COMPLETION_KEY = "livestreams:completion";

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || "Request failed");
  }
  return body.data as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Everything the page loads and changes. GET /api/livestreams shows the last copy at once
 * (client cache) and refreshes quietly; members load once per visit (managers only); the
 * completion roster loads only when it is shown. Mutations throw, so each dialog or row can
 * show its own error and pending state.
 */
export function useLivestreamsData() {
  const [data, setData] = useState<Payload | null>(null);
  /** The latest payload that came from the network (not the cache). */
  const [fresh, setFresh] = useState<Payload | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Only the newest payload request may write state; `inFlight` keeps the spinner up until all settle. */
  const payloadSeq = useRef(0);
  const inFlight = useRef(0);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const membersRequest = useRef<Promise<void> | null>(null);
  const membersSeq = useRef(0);

  const [completion, setCompletion] = useState<CompletionRow[] | null>(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completionLoaded = useRef(false);
  const completionSeq = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++payloadSeq.current;
    inFlight.current += 1;
    setRefreshing(true);
    try {
      const payload = await readJson<Payload>(await fetch("/api/livestreams"));
      if (seq !== payloadSeq.current) return;
      rememberValue(PAYLOAD_KEY, payload);
      setData(payload);
      setFresh(payload);
      setLoadError(null);
    } catch (e) {
      if (seq === payloadSeq.current) setLoadError(errorMessage(e, "Failed to load"));
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    // Show the last copy at once and refresh it quietly (src/lib/client-cache.ts).
    const cached = cachedValue<Payload>(PAYLOAD_KEY);
    if (cached) {
      setData(cached);
      setInitialLoading(false);
    }
    void reload();
  }, [reload]);

  const loadCompletion = useCallback(async () => {
    const seq = ++completionSeq.current;
    setCompletionLoading(true);
    setCompletionError(null);
    try {
      const body = await readJson<{ rows: CompletionRow[] }>(await fetch("/api/livestreams/completion"));
      if (seq !== completionSeq.current) return;
      rememberValue(COMPLETION_KEY, body.rows);
      completionLoaded.current = true;
      setCompletion(body.rows);
    } catch (e) {
      if (seq === completionSeq.current) setCompletionError(errorMessage(e, "Failed to load completion"));
    } finally {
      if (seq === completionSeq.current) setCompletionLoading(false);
    }
  }, []);

  /** Called when Completion is shown: the last copy at once, then a quiet refresh. */
  const showCompletion = useCallback(() => {
    const cached = cachedValue<CompletionRow[]>(COMPLETION_KEY);
    if (cached) setCompletion((current) => current ?? cached);
    void loadCompletion();
  }, [loadCompletion]);

  const fetchMembers = useCallback(() => {
    const seq = ++membersSeq.current;
    setMembersError(null);
    const request = (async () => {
      try {
        const body = await readJson<{ members: Member[] }>(await fetch("/api/livestreams/members"));
        if (seq !== membersSeq.current) return;
        rememberValue(MEMBERS_KEY, body.members);
        setMembers(body.members);
      } catch (e) {
        if (seq !== membersSeq.current) return;
        membersRequest.current = null;
        setMembersError(errorMessage(e, "Couldn't load members"));
      }
    })();
    membersRequest.current = request;
    return request;
  }, []);

  /** Loads the member picker once per visit (managers only); safe to call repeatedly. */
  const ensureMembers = useCallback(() => {
    if (membersRequest.current) return membersRequest.current;
    const cached = cachedValue<Member[]>(MEMBERS_KEY);
    if (cached) setMembers(cached);
    return fetchMembers();
  }, [fetchMembers]);

  /** Refresh: reload the member list too, but only once it has been asked for (managers). */
  const refreshMembers = useCallback(() => {
    if (!membersRequest.current && !members) return;
    void fetchMembers();
  }, [fetchMembers, members]);

  // Managers: warm the picker after first paint, not on the critical path.
  const canManage = Boolean(data?.canManage);
  useEffect(() => {
    if (!canManage) return;
    const timer = window.setTimeout(() => void ensureMembers(), 1200);
    return () => window.clearTimeout(timer);
  }, [canManage, ensureMembers]);

  /** After any change: refresh the payload, the roster if it was loaded, and the sidebar count. */
  const afterChange = useCallback(async () => {
    requestNavStatusRefresh(["livestreams"]);
    if (completionLoaded.current) void loadCompletion();
    await reload();
  }, [loadCompletion, reload]);

  const saveEvent = useCallback(
    async (eventId: string | null, body: ReturnType<typeof eventPayload>) => {
      await readJson(
        await fetch(eventId ? `/api/livestreams/events/${eventId}` : "/api/livestreams/events", jsonInit(eventId ? "PATCH" : "POST", body))
      );
      void afterChange();
    },
    [afterChange]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      await readJson(await fetch(`/api/livestreams/events/${eventId}`, { method: "DELETE" }));
      void afterChange();
    },
    [afterChange]
  );

  const requestSignup = useCallback(
    async (eventId: string, note: string) => {
      await readJson(await fetch("/api/livestreams/signups", jsonInit("POST", { eventId, availableFullEvent: true, note })));
      await afterChange();
    },
    [afterChange]
  );

  const reviewSignup = useCallback(
    async (signupId: string, status: "APPROVED" | "DENIED") => {
      await readJson(await fetch(`/api/livestreams/signups/${signupId}`, jsonInit("PATCH", { status })));
      await afterChange();
    },
    [afterChange]
  );

  const addManager = useCallback(
    async (userId: string) => {
      await readJson(await fetch("/api/livestreams/managers", jsonInit("POST", { userId })));
      // The Managers dialog opens from every view, so the Completion roster (Manager tag,
      // managed count, credit) refreshes too when it has been loaded.
      await afterChange();
    },
    [afterChange]
  );

  const removeManager = useCallback(
    async (userId: string) => {
      await readJson(await fetch(`/api/livestreams/managers?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }));
      await afterChange();
    },
    [afterChange]
  );

  return {
    data,
    fresh,
    initialLoading,
    refreshing,
    loadError,
    reload,
    members,
    membersError,
    ensureMembers,
    refreshMembers,
    completion,
    completionLoading,
    completionError,
    showCompletion,
    loadCompletion,
    saveEvent,
    deleteEvent,
    requestSignup,
    reviewSignup,
    addManager,
    removeManager
  };
}
