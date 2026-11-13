"use client";

import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { CutNotes } from "@/components/applications/cut-notes";
import { RoughCutPlayer } from "@/components/applications/rough-cut-player";
import { WordCount } from "@/components/applications/word-count";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, FormSection } from "@/components/kit/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationAnswers, CutNote } from "@/src/lib/applications/answers";
import type { ApplicantConfig } from "@/src/lib/applications/config";

type Props = {
  roundId: string;
  hasRoughCut: boolean;
  answers: ApplicationAnswers;
  config: ApplicantConfig;
  onChange: (patch: Partial<ApplicationAnswers>) => void;
};

/**
 * Section 3: watch the rough cut and leave timestamped notes the way the Portal's review page does
 * (one box under the list writes a note at the playhead), then the top-three summary and air call.
 */
export function CutStep({ roundId, hasRoughCut, answers, config, onChange }: Props) {
  const cut = config.roughCut;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerBox = useRef<HTMLDivElement | null>(null);
  const [playhead, setPlayhead] = useState(0);

  // timeupdate doesn't bubble, but a capture listener on an ancestor still hears it, and this works
  // even though the video element only mounts once its signed URL loads.
  useEffect(() => {
    const box = playerBox.current;
    if (!box) return;
    const onTime = (event: Event) => setPlayhead(Math.floor((event.target as HTMLVideoElement).currentTime || 0));
    box.addEventListener("timeupdate", onTime, true);
    box.addEventListener("seeked", onTime, true);
    return () => {
      box.removeEventListener("timeupdate", onTime, true);
      box.removeEventListener("seeked", onTime, true);
    };
  }, []);

  function seek(t: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    video.focus();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="max-w-[70ch] text-[15px] font-medium leading-snug">{cut.instructions}</p>
        {cut.context ? <p className="max-w-[70ch] whitespace-pre-line text-sm text-muted-foreground">{cut.context}</p> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div ref={playerBox} className="lg:sticky lg:top-[calc(var(--app-header-h,0px)+1rem)]">
          {hasRoughCut ? (
            <RoughCutPlayer roundId={roundId} videoRef={videoRef} className="rounded-md" />
          ) : (
            <EmptyState icon={Film} title="The rough cut isn't posted yet" description="Check back soon. You can fill in the other sections meanwhile." />
          )}
        </div>
        <CutNotes
          notes={answers.cutNotes}
          categories={cut.categories}
          minNotes={cut.minNotes}
          maxNotes={cut.maxNotes}
          maxChars={cut.noteMaxChars}
          playhead={playhead}
          onPause={() => videoRef.current?.pause()}
          onSeek={seek}
          onChange={(cutNotes: CutNote[]) => onChange({ cutNotes })}
        />
      </div>

      <FormSection title="Your call">
        <Field label={cut.summaryPrompt} htmlFor="app-summary" required>
          <Textarea id="app-summary" rows={6} value={answers.cutSummary} onChange={(e) => onChange({ cutSummary: e.target.value })} aria-describedby="app-summary-count" />
          <WordCount id="app-summary-count" value={answers.cutSummary} max={cut.summaryMaxWords} />
        </Field>
        <Field label="Air decision" required>
          <div role="radiogroup" aria-label="Air decision" className="flex flex-wrap gap-2">
            {cut.airOptions.map((option) => (
              <Button
                key={option}
                type="button"
                role="radio"
                aria-checked={answers.airDecision === option}
                variant={answers.airDecision === option ? "default" : "outline"}
                onClick={() => onChange({ airDecision: option })}
              >
                {option}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="One sentence of reasoning" htmlFor="app-air-reason" required>
          <Input id="app-air-reason" value={answers.airReason} onChange={(e) => onChange({ airReason: e.target.value })} aria-describedby="app-air-count" />
          <WordCount id="app-air-count" value={answers.airReason} max={cut.airReasonMaxWords} />
        </Field>
      </FormSection>
    </div>
  );
}
