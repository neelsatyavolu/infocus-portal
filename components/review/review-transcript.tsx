"use client";

import { Captions, Copy } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { formatTimecode } from "@/src/lib/timecode";
import type { TranscriptsState } from "@/components/review/use-transcripts";

/** The comments panel's Transcript tab: transcribe, wait, then click a line to jump there. */
export function ReviewTranscript({
  versionId,
  versionNumber,
  transcripts,
  onSeek
}: {
  versionId: string;
  versionNumber: number | undefined;
  transcripts: TranscriptsState;
  onSeek: (timeSeconds: number) => void;
}) {
  const transcript = transcripts.transcriptFor(versionId);
  const loading = transcripts.isTranscribing(versionId);
  const label = `v${versionNumber ?? "—"}`;

  if (!transcript) {
    if (loading) {
      return (
        <div role="status" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Spinner />
            Transcribing {label}…
          </span>
          <span className="text-[13px] text-muted-foreground">This can take a minute or two.</span>
        </div>
      );
    }
    return (
      <EmptyState
        icon={Captions}
        title="No transcript yet"
        description="Transcribing takes a minute or two. Each version is transcribed once."
        action={
          <Button type="button" variant="outline" title="Transcribe this version" onClick={() => void transcripts.transcribe(versionId)}>
            <Captions aria-hidden />
            Transcribe {label}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-8 items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Transcript · {label}</p>
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void transcripts.copy(versionId)}
          disabled={transcript.segments.length === 0}
        >
          <Copy aria-hidden />
          Copy
        </Button>
      </div>
      {transcript.segments.length === 0 ? (
        <EmptyState size="inline" icon={Captions} title="No speech found in this version." className="px-0" />
      ) : (
        <ol className="-mx-1 space-y-0.5">
          {transcript.segments.map((segment, index) => (
            <li key={`${segment.start}-${index}`}>
              <button
                type="button"
                onClick={() => onSeek(segment.start)}
                className="grid w-full grid-cols-[4.25rem_minmax(0,1fr)] gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Jump to this moment"
              >
                <span className="pt-px font-mono-broadcast text-xs tabular-nums text-[var(--brand-green)]">
                  {formatTimecode(segment.start)}
                </span>
                <span className="text-sm text-foreground">{segment.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
