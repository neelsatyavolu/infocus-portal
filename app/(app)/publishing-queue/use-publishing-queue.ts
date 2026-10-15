"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import type { NasUploadFields } from "@/src/lib/nas-upload-client";
import { addedToShowMessage } from "./queue-view-model";
import type { Candidate, CandidatesStatus, QueueData, QueueRow, UpcomingShow } from "./queue-types";

const QUEUE_URL = "/api/package-cycle/queue";
/** client-cache key of the last plain queue load (never the ?candidates=1 load). */
const QUEUE_CACHE_KEY = "publishing-queue";
const LOAD_ERROR = "Could not load the publishing queue.";

type ApiBody<T> = { data?: T; error?: { message?: string } };

async function readBody<T>(response: Response): Promise<ApiBody<T>> {
  try {
    return (await response.json()) as ApiBody<T>;
  } catch {
    return {};
  }
}

/**
 * Producers' custom upload: init → upload to InFocus Drive → complete → poster. Returns the
 * show auto-assign picked. Throws with the server's message (or a plain one) on failure.
 */
export async function uploadCustomPackage(
  title: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<string | null> {
  const initResponse = await fetch(`${QUEUE_URL}/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "init", title, fileName: file.name })
  });
  const initBody = await readBody<{ mediaId: string; versionId: string; upload: NasUploadFields }>(initResponse);
  if (!initResponse.ok || !initBody.data) {
    throw new Error(initBody.error?.message ?? "Could not start the upload.");
  }
  const { mediaId, versionId, upload } = initBody.data;
  const { uploadFileToNas } = await import("@/src/lib/nas-upload-client");
  await uploadFileToNas(file, upload, (bytesUploaded, bytesTotal) => {
    if (!bytesTotal) return;
    onProgress(Math.max(0, (bytesUploaded / bytesTotal) * 100));
  });
  const completeResponse = await fetch(`${QUEUE_URL}/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "complete", title, mediaId, versionId })
  });
  const completeBody = await readBody<{ queuedForShowDate?: string | null }>(completeResponse);
  if (!completeResponse.ok) {
    throw new Error(completeBody.error?.message ?? "Could not add the package.");
  }
  const { uploadNasPosterBestEffort } = await import("@/src/lib/video-thumbnail-client");
  await uploadNasPosterBestEffort(file, mediaId, versionId);
  return completeBody.data?.queuedForShowDate ?? null;
}

/**
 * The queue's data and every call that changes it. The first copy comes from the server
 * (page.tsx); without it the last copy shows at once (src/lib/client-cache.ts) while a quiet
 * refresh runs. Only the plain queue is cached.
 */
export function usePublishingQueue(initialData: QueueData | null) {
  const [rows, setRows] = useState<QueueRow[]>(initialData?.packages ?? []);
  const [upcoming, setUpcoming] = useState<UpcomingShow[]>(initialData?.upcomingShows ?? []);
  const [today, setToday] = useState<string | undefined>(initialData?.today);
  const [publishingConfigured, setPublishingConfigured] = useState<boolean | null>(initialData?.publishingConfigured ?? null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesStatus, setCandidatesStatus] = useState<CandidatesStatus>("idle");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(initialData ? "ready" : "loading");
  const [retrying, setRetrying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // While the Add dialog is open, reloads also refresh the candidate list.
  const wantCandidates = useRef(false);

  const applyQueue = useCallback((data: QueueData, withCandidates: boolean) => {
    setRows(data.packages ?? []);
    setPublishingConfigured(data.publishingConfigured ?? null);
    setToday(data.today);
    setUpcoming(data.upcomingShows ?? []);
    if (withCandidates) setCandidates(data.candidates ?? []);
  }, []);

  const load = useCallback(
    async (withCandidates = false) => {
      const response = await fetch(withCandidates ? `${QUEUE_URL}?candidates=1` : QUEUE_URL, { cache: "no-store" });
      const body = await readBody<QueueData>(response);
      // Never apply a failed reply: it would blank the queue (and the cached copy on screen).
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? LOAD_ERROR);
      if (!withCandidates) rememberValue(QUEUE_CACHE_KEY, body.data);
      applyQueue(body.data, withCandidates);
      // Any good load (retry, opening Add package, a reload after a change) clears the error view.
      setPhase("ready");
    },
    [applyQueue]
  );

  useEffect(() => {
    if (initialData) {
      // Already fresh from the server: keep it as the last copy for a client-side return.
      rememberValue(QUEUE_CACHE_KEY, initialData);
      return;
    }
    const cached = cachedValue<QueueData>(QUEUE_CACHE_KEY);
    if (cached) {
      applyQueue(cached, false);
      setPhase("ready");
    }
    load().catch(() => {
      // With nothing on screen the inline alert says it; over a cached copy only a toast does.
      if (cached) toast.error(LOAD_ERROR);
      else setPhase("error");
    });
  }, [initialData, applyQueue, load]);

  async function retry() {
    setRetrying(true);
    try {
      await load(wantCandidates.current);
    } catch {
      toast.error(LOAD_ERROR);
    } finally {
      setRetrying(false);
    }
  }

  async function loadCandidates() {
    wantCandidates.current = true;
    setCandidatesStatus("loading");
    try {
      await load(true);
      setCandidatesStatus("ready");
    } catch {
      setCandidatesStatus("error");
      toast.error("Could not load packages to add.");
    }
  }

  function stopCandidates() {
    wantCandidates.current = false;
  }

  async function reloadQuietly() {
    try {
      await load(wantCandidates.current);
    } catch {
      toast.error(LOAD_ERROR);
    }
  }

  async function updateQueue(rowId: string, queued: boolean, showDate?: string | null) {
    const previous = rows;
    const alreadyQueued = previous.some((row) => row.id === rowId);
    if (queued && showDate) {
      setRows((current) => current.map((row) => (row.id === rowId ? { ...row, queuedForShowDate: showDate } : row)));
    }
    setBusyId(rowId);
    try {
      const response = await fetch(QUEUE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, queued, showDate })
      });
      const payload = await readBody<{ queuedForShowDate?: string | null }>(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not update the queue.");
      await reloadQuietly();
      toast.success(
        !queued ? "Removed from the queue." : alreadyQueued ? "Moved." : addedToShowMessage(payload.data?.queuedForShowDate)
      );
    } catch (error) {
      setRows(previous);
      toast.error(error instanceof Error ? error.message : "Could not update the queue.");
    } finally {
      setBusyId(null);
    }
  }

  async function publishNow(row: QueueRow) {
    setBusyId(row.id);
    try {
      const response = await fetch(`${QUEUE_URL}/${row.id}/youtube`, { method: "POST" });
      const payload = await readBody<unknown>(response);
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not start the YouTube upload.");
      await reloadQuietly();
      toast.success("Uploading to YouTube. Website managers get the embed code once it's ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the YouTube upload.");
    } finally {
      setBusyId(null);
    }
  }

  /** After a custom upload: the dialog has closed, so this reloads (and caches) the plain queue. */
  async function afterCustomAdded(showDate: string | null) {
    await reloadQuietly();
    toast.success(addedToShowMessage(showDate));
  }

  return {
    rows,
    upcoming,
    today,
    publishingConfigured,
    candidates,
    candidatesStatus,
    phase,
    retrying,
    busyId,
    retry,
    loadCandidates,
    stopCandidates,
    updateQueue,
    publishNow,
    afterCustomAdded
  };
}
