"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatTimecode } from "@/src/lib/timecode";
import { cn } from "@/src/lib/utils";

type TranscriptSegment = { start: number; text: string };
type Transcript = { versionId: string; segments: TranscriptSegment[] };

type ReviewTranscriptButtonProps = {
  mediaId: string;
  versionId: string;
  versionNumber: number | undefined;
  onSeek: (timeSeconds: number) => void;
};

export function ReviewTranscriptButton({ mediaId, versionId, versionNumber, onSeek }: ReviewTranscriptButtonProps) {
  const [transcripts, setTranscripts] = useState<Record<string, Transcript>>({});
  const [loadingVersionIds, setLoadingVersionIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeVersionIdRef = useRef(versionId);

  const transcript = transcripts[versionId];
  const loading = loadingVersionIds.includes(versionId);

  useEffect(() => {
    activeVersionIdRef.current = versionId;
    setOpen(false);
  }, [versionId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  async function transcribe() {
    const requestedVersionId = versionId;
    setLoadingVersionIds((current) => [...current, requestedVersionId]);

    try {
      const response = await fetch(`/api/media/${mediaId}/versions/${requestedVersionId}/transcript`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { transcript: Transcript };
        error?: { message?: string };
      } | null;

      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? "Transcription failed. Try again.");
      }

      const result = payload.data.transcript;
      setTranscripts((current) => ({ ...current, [requestedVersionId]: result }));
      if (activeVersionIdRef.current === requestedVersionId) {
        setOpen(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transcription failed. Try again.");
    } finally {
      setLoadingVersionIds((current) => current.filter((id) => id !== requestedVersionId));
    }
  }

  function handleClick() {
    if (transcript) {
      setOpen((current) => !current);
      return;
    }
    if (!loading) {
      void transcribe();
    }
  }

  async function copyTranscript() {
    if (!transcript) {
      return;
    }
    const text = transcript.segments
      .map((segment) => `[${formatTimecode(segment.start)}] ${segment.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Transcript copied");
    } catch {
      toast.error("Could not copy the transcript.");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-9 gap-1.5 px-3", open ? "bg-foreground/10 text-foreground" : "")}
        onClick={handleClick}
        disabled={loading}
        aria-expanded={transcript ? open : undefined}
        title={loading ? "Transcribing can take a minute or two" : "Transcribe this version"}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Captions className="h-3.5 w-3.5" />}
        {loading ? "Transcribing…" : transcript ? "Transcript" : "Transcribe"}
      </Button>

      {open && transcript ? (
        <div className="absolute left-0 top-[calc(100%+0.55rem)] z-[140] w-[min(92vw,30rem)] rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Transcript · v{versionNumber ?? "—"}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => void copyTranscript()}
                disabled={transcript.segments.length === 0}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setOpen(false)}
                aria-label="Close transcript"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {transcript.segments.length === 0 ? (
            <div className="rounded-md border border-border bg-muted px-3 py-6 text-center text-xs text-muted-foreground">
              No speech found in this version.
            </div>
          ) : (
            <ol className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-1">
              {transcript.segments.map((segment, index) => (
                <li key={`${segment.start}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onSeek(segment.start)}
                    className="grid w-full grid-cols-[4.25rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-muted"
                    title="Jump to this moment"
                  >
                    <span className="pt-px font-mono text-xs tabular-nums text-[var(--brand-green)]">
                      {formatTimecode(segment.start)}
                    </span>
                    <span className="text-sm text-foreground">{segment.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
