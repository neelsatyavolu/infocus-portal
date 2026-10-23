"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  SHOW_EDITOR_COMMAND_LABELS, type ShowEditBackend, type ShowEditorCommandKind, type ShowEditState, type ShowEditView
} from "@/src/lib/show-editor";
import type { ShowEditSource } from "@/src/lib/show-editor-sources";
import type { ShownPairing } from "./show-edit-machines";
import type { SettingsPatch } from "./show-edit-settings";

const ACTIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 60_000;
const LOAD_FALLBACK = "Could not load automatic editing.";

export type EditAction =
  | { action: "start"; date: string; sources: ShowEditSource[]; note?: string; publish?: { date: string; time: string } }
  | { action: "cancel"; id: string }
  | { action: "redo"; id: string; note?: string }
  | { action: "fix"; id: string; text: string; remember: boolean }
  | { action: "approve"; id: string; publishAt: string }
  | { action: "pair"; backend: ShowEditBackend; deviceId: string }
  | { action: "activate"; deviceId: string }
  | { action: "unlink"; deviceId: string }
  | { action: "command"; deviceId: string; kind: ShowEditorCommandKind }
  | ({ action: "settings" } & SettingsPatch);

export function isActiveJob(job: ShowEditView | null) {
  return job?.status === "QUEUED" || job?.status === "RUNNING";
}

/** A failed load and the date it was for, so it only shows while that date is open. */
type LoadError = { date: string; message: string };

/**
 * One date's automatic-editing state (GET /api/show-roles/edits), polled every 10 s while an edit or a
 * sign-in is in flight and every minute otherwise, plus the actions every view sends (POST, then reload).
 * `showDate` is null until the page knows which show is open.
 */
export function useShowEdit(showDate: string | null) {
  const [state, setState] = useState<{ date: string; value: ShowEditState } | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [busy, setBusy] = useState<EditAction["action"] | null>(null);
  const [pairing, setPairing] = useState<ShownPairing | null>(null);
  // The date open now, so an answer for a date someone already left never lands.
  const dateRef = useRef(showDate);
  useEffect(() => {
    dateRef.current = showDate;
  }, [showDate]);

  const load = useCallback(() => {
    if (!showDate) return Promise.resolve();
    return fetch(`/api/show-roles/edits?date=${encodeURIComponent(showDate)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { data?: ShowEditState; error?: { message?: string } };
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? LOAD_FALLBACK);
        if (dateRef.current !== showDate) return;
        setState({ date: showDate, value: body.data });
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (dateRef.current !== showDate) return;
        setLoadError({ date: showDate, message: error instanceof Error ? error.message : LOAD_FALLBACK });
      });
  }, [showDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = state?.date === showDate ? state.value : null;
  const pairingInFlight = (value?.pairings ?? []).some((entry) => entry.status === "waiting" || entry.status === "sent");
  const active = isActiveJob(value?.job ?? null) || pairingInFlight;
  useEffect(() => {
    if (!showDate) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, active, showDate]);

  async function send(body: EditAction, success?: string) {
    setBusy(body.action);
    try {
      const response = await fetch("/api/show-roles/edits", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "That didn't work. Try again.");
      if (body.action === "pair") {
        setPairing({ backend: body.backend, ...(payload.data as Omit<ShownPairing, "backend">) });
      }
      if (body.action === "command") toast.success(`${SHOW_EDITOR_COMMAND_LABELS[body.kind]} sent. The result shows here in about a minute.`);
      if (success) toast.success(success);
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    /** This date's state; while another date loads, the last one stays (dimmed by the page). */
    state: value ?? state?.value ?? null,
    /** True while the state on screen belongs to another date. */
    stale: value === null && state !== null,
    error: loadError?.date === showDate ? loadError.message : null,
    busy,
    pairing,
    send,
    reload: load
  };
}
