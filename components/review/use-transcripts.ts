"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatTimecode } from "@/src/lib/timecode";

export type TranscriptSegment = { start: number; text: string };
export type Transcript = { versionId: string; segments: TranscriptSegment[] };

export type TranscriptsState = ReturnType<typeof useTranscripts>;

/**
 * Transcripts per version, kept for the page's life. Several versions can transcribe at once; when
 * one finishes and the viewer is still on that version, `onReady` runs (the panel switches to its
 * Transcript tab).
 */
export function useTranscripts({
  mediaId,
  activeVersionId,
  onReady
}: {
  mediaId: string;
  activeVersionId: string;
  onReady: (versionId: string) => void;
}) {
  const [transcripts, setTranscripts] = useState<Record<string, Transcript>>({});
  const [loadingVersionIds, setLoadingVersionIds] = useState<string[]>([]);
  const activeVersionIdRef = useRef(activeVersionId);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    activeVersionIdRef.current = activeVersionId;
    onReadyRef.current = onReady;
  });

  const transcribe = useCallback(
    async (versionId: string) => {
      setLoadingVersionIds((current) => (current.includes(versionId) ? current : [...current, versionId]));
      try {
        const response = await fetch(`/api/media/${mediaId}/versions/${versionId}/transcript`, { method: "POST" });
        const payload = (await response.json().catch(() => null)) as {
          data?: { transcript: Transcript };
          error?: { message?: string };
        } | null;
        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error?.message ?? "Transcription failed. Try again.");
        }
        const result = payload.data.transcript;
        setTranscripts((current) => ({ ...current, [versionId]: result }));
        if (activeVersionIdRef.current === versionId) {
          onReadyRef.current(versionId);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Transcription failed. Try again.");
      } finally {
        setLoadingVersionIds((current) => current.filter((id) => id !== versionId));
      }
    },
    [mediaId]
  );

  const copy = useCallback(
    async (versionId: string) => {
      const transcript = transcripts[versionId];
      if (!transcript) {
        return;
      }
      const text = transcript.segments.map((segment) => `[${formatTimecode(segment.start)}] ${segment.text}`).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Transcript copied");
      } catch {
        toast.error("Could not copy the transcript.");
      }
    },
    [transcripts]
  );

  return {
    transcriptFor: (versionId: string) => transcripts[versionId] ?? null,
    isTranscribing: (versionId: string) => loadingVersionIds.includes(versionId),
    transcribe,
    copy
  };
}
