"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { clampExtensionDays, EXTENSION_REQUESTS_CHANGED_EVENT } from "@/src/lib/package-extensions";
import { withMemberVote, withProducerVote } from "./request-patch";
import type { GrantTerms, Payload, RequestStatus } from "./request-view";

const CACHE_KEY = "extension-requests";
const LOAD_ERROR = "Failed to load extension requests.";

/**
 * A mutation's outcome, with the list as the vote left it (patched from the response; a quiet
 * reload follows) so the page can open the next request.
 */
export type MutationResult = { ok: boolean; data: Payload | null };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function send(url: string, method: "POST" | "PATCH", body: unknown, fallback: string) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? fallback);
  }
  return data;
}

function statusOf(body: unknown): RequestStatus | null {
  const status = (body as { data?: { status?: unknown } } | null)?.data?.status;
  return status === "PENDING" || status === "APPROVED" || status === "DENIED" ? status : null;
}

/** Tells the shell to refresh the sidebar / stage-bar "waiting on you" count. */
function announceChange() {
  window.dispatchEvent(new Event(EXTENSION_REQUESTS_CHANGED_EVENT));
}

/**
 * Loads GET /api/extensions/requests (last copy shown at once via src/lib/client-cache.ts, then a
 * quiet refresh) and wraps every write the page makes. A failed first load is returned as
 * `loadError` for the page to show in place; a failed refresh keeps the data and toasts.
 */
export function useExtensionRequests() {
  const [payload, setPayload] = useState<Payload | null>(() =>
    typeof window === "undefined" ? null : (cachedValue<Payload>(CACHE_KEY) ?? null)
  );
  const payloadRef = useRef(payload);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [memberBusy, setMemberBusy] = useState<{ id: string; agreed: boolean } | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  // Only the newest load may write: an older response (the mount refresh) that lands after the
  // reload following a vote would otherwise bring back the pre-vote list.
  const latestLoad = useRef(0);

  const load = useCallback(async (): Promise<Payload | null> => {
    const ticket = ++latestLoad.current;
    const isLatest = () => ticket === latestLoad.current;
    setRefreshing(true);
    try {
      const response = await fetch("/api/extensions/requests", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        throw new Error(body?.error?.message ?? LOAD_ERROR);
      }
      const data = body.data as Payload;
      if (!isLatest()) return null;
      rememberValue(CACHE_KEY, data);
      payloadRef.current = data;
      setPayload(data);
      setLoadError(null);
      return data;
    } catch (error) {
      if (!isLatest()) return null;
      const message = errorMessage(error, LOAD_ERROR);
      if (payloadRef.current) toast.error(message);
      else setLoadError(message);
      return null;
    } finally {
      if (isLatest()) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Shows a saved vote at once and reloads in the background. Without a list or a status to
   * patch, waits for the reload as before. Returns the list the page should advance through.
   */
  const applyVote = useCallback(
    async (patch: ((current: Payload) => Payload) | null): Promise<Payload | null> => {
      const current = payloadRef.current;
      if (!patch || !current) return load();
      const next = patch(current);
      payloadRef.current = next;
      setPayload(next);
      // The reload takes a newer ticket, so an older load still in flight can't bring back the pre-vote list.
      void load();
      return next;
    },
    [load]
  );

  const submitRequest = useCallback(
    async (input: { cycleNumber: number; requestedDays: number; reason: string }) => {
      try {
        await send(
          "/api/extensions/requests",
          "POST",
          { ...input, requestedDays: clampExtensionDays(input.requestedDays) },
          "Failed to submit request."
        );
        toast.success("Extension request submitted for your group. Teammates must agree next.");
        announceChange();
        await load();
        return true;
      } catch (error) {
        toast.error(errorMessage(error, "Failed to submit request."));
        return false;
      }
    },
    [load]
  );

  /** `onSaved` runs once the vote is stored, before the reload (dialogs close right away). */
  const decideProducer = useCallback(
    async (
      input: {
        requestId: string;
        approved: boolean;
        terms?: GrantTerms | null;
        reason?: string;
        grantWithoutAgreement?: true;
      },
      onSaved?: () => void
    ): Promise<MutationResult> => {
      try {
        const body = await send(
          "/api/extensions/requests",
          "PATCH",
          {
            kind: "producer",
            requestId: input.requestId,
            approved: input.approved,
            reason: input.reason,
            grantWithoutAgreement: input.grantWithoutAgreement,
            ...(input.terms ?? {})
          },
          "Failed to record decision."
        );
        onSaved?.();
        announceChange();
        const status = statusOf(body);
        const at = new Date().toISOString();
        return {
          ok: true,
          data: await applyVote(
            status
              ? (current) =>
                  withProducerVote(current, {
                    requestId: input.requestId,
                    approved: input.approved,
                    reason: input.reason,
                    grantWithoutAgreement: input.grantWithoutAgreement,
                    status,
                    at
                  })
              : null
          )
        };
      } catch (error) {
        toast.error(errorMessage(error, "Failed to record decision."));
        return { ok: false, data: null };
      }
    },
    [applyVote]
  );

  const decideMember = useCallback(
    async (requestId: string, agreed: boolean): Promise<MutationResult> => {
      setMemberBusy({ id: requestId, agreed });
      try {
        const body = await send(
          "/api/extensions/requests",
          "PATCH",
          { kind: "member", requestId, agreed },
          "Failed to record agreement."
        );
        toast.success(agreed ? "You agreed to the extension request." : "You declined the extension request.");
        announceChange();
        const status = statusOf(body);
        const at = new Date().toISOString();
        return {
          ok: true,
          data: await applyVote(status ? (current) => withMemberVote(current, { requestId, agreed, status, at }) : null)
        };
      } catch (error) {
        toast.error(errorMessage(error, "Failed to record agreement."));
        return { ok: false, data: null };
      } finally {
        setMemberBusy(null);
      }
    },
    [applyVote]
  );

  const emailGroup = useCallback(async (requestId: string) => {
    setEmailingId(requestId);
    try {
      const body = await send("/api/extensions/requests/notify", "POST", { requestId }, "Failed to email the group.");
      const sent = Number(body?.data?.sent ?? 0);
      toast.success(`Emailed ${sent} ${sent === 1 ? "student" : "students"}.`);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to email the group."));
    } finally {
      setEmailingId(null);
    }
  }, []);

  /** After a direct grant (the dialog posts it and toasts): the new request comes with a quiet reload. */
  const afterGrant = useCallback(async () => {
    announceChange();
    void load();
  }, [load]);

  return {
    payload,
    loadError,
    refreshing,
    memberBusy,
    emailingId,
    load,
    submitRequest,
    decideProducer,
    decideMember,
    emailGroup,
    afterGrant
  };
}
