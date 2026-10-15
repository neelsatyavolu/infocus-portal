/* eslint-disable @next/next/no-img-element -- the preview is a server-rendered PNG from our own API. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { Panel } from "@/components/kit/panel";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  THUMBNAIL_SIZES,
  finalScoreInputs,
  pacificDateTimeInputs,
  parseEventTitle,
  type ThumbnailFormat,
  type ThumbnailTemplate
} from "@/src/lib/live/thumbnail";
import type { ScoreboardState } from "@/src/lib/live/scoreboard";
import { cn } from "@/src/lib/utils";
import type { LiveEventSummary } from "@/src/server/live-graphics";
import { ActionDock, CARD_LABEL_CLASS } from "./live-controls";

const TEMPLATE_OPTIONS: Array<{ value: ThumbnailTemplate; label: string }> = [
  { value: "matchup", label: "A · Matchup" },
  { value: "event", label: "C · Event" },
  { value: "final", label: "Final score" }
];

function formatLabel(full: string, short: string): ReactNode {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

const FORMAT_OPTIONS: Array<{ value: ThumbnailFormat; label: ReactNode; ariaLabel: string }> = [
  { value: "youtube", label: "YouTube", ariaLabel: "YouTube" },
  { value: "post", label: formatLabel("Instagram post", "Post"), ariaLabel: "Instagram post" },
  { value: "story", label: formatLabel("Instagram story", "Story"), ariaLabel: "Instagram story" }
];

const PREVIEW_DEBOUNCE_MS = 400;

/** A caps label over one control; `wide` spans both columns of the form grid. */
function FormField({ id, label, wide = false, children }: { id: string; label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", wide && "col-span-2")}>
      <label htmlFor={id} className={CARD_LABEL_CLASS}>
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLASS = "h-11 md:h-9";

/** A caps label over one full-width control (Template, Format), so both cards start with the same row. */
function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className={CARD_LABEL_CLASS} aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}

export function ThumbnailPanel({ event, scoreboard }: { event: LiveEventSummary; scoreboard: ScoreboardState }) {
  const parsed = useMemo(() => parseEventTitle(event.title), [event.title]);
  const start = useMemo(() => pacificDateTimeInputs(event.startsAt), [event.startsAt]);
  const [template, setTemplate] = useState<ThumbnailTemplate>(parsed.isMatchup ? "matchup" : "event");
  const [format, setFormat] = useState<ThumbnailFormat>("youtube");
  const [fields, setFields] = useState({
    home: parsed.home.slice(0, 18),
    away: parsed.away.slice(0, 18),
    line: parsed.line.slice(0, 40),
    ...finalScoreInputs(scoreboard),
    title: event.title.slice(0, 60),
    location: event.location.slice(0, 30),
    date: start.date,
    time: start.time
  });

  const params = useMemo(() => {
    const search = new URLSearchParams({ template, format });
    Object.entries(fields).forEach(([key, value]) => value && search.set(key, value));
    return search.toString();
  }, [template, format, fields]);

  const [previewParams, setPreviewParams] = useState(params);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setPreviewParams(params), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [params]);
  useEffect(() => {
    setLoading(true);
    setFailed(false);
  }, [previewParams]);

  const size = THUMBNAIL_SIZES[format];
  const sizeText = `${size.width} × ${size.height}`;
  const portrait = format !== "youtube";
  const set = (key: keyof typeof fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const text = (key: keyof typeof fields, label: string, max: number, wide = false) => (
    <FormField id={`thumb-${key}`} label={label} wide={wide}>
      <Input id={`thumb-${key}`} value={fields[key]} maxLength={max} onChange={(changeEvent) => set(key)(changeEvent.target.value)} className={INPUT_CLASS} />
    </FormField>
  );
  const score = (key: "homeScore" | "awayScore", label: string) => (
    <FormField id={`thumb-${key}`} label={label}>
      <Input
        id={`thumb-${key}`}
        inputMode="numeric"
        value={fields[key]}
        onChange={(changeEvent) => set(key)(changeEvent.target.value.replace(/\D/g, "").slice(0, 3))}
        className={cn(INPUT_CLASS, "tabular-nums")}
      />
    </FormField>
  );
  const date = (
    <FormField id="thumb-date" label="Date">
      <Input id="thumb-date" type="date" value={fields.date} onChange={(changeEvent) => set("date")(changeEvent.target.value)} className={INPUT_CLASS} />
    </FormField>
  );
  const time = (
    <FormField id="thumb-time" label="Start time">
      <Input id="thumb-time" type="time" value={fields.time} onChange={(changeEvent) => set("time")(changeEvent.target.value)} className={INPUT_CLASS} />
    </FormField>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
      <Panel padding="md" aria-label="Thumbnail" title="Thumbnail" bodyClassName="flex flex-col">
        <div className="flex flex-1 flex-col gap-4">
          <ControlRow label="Template">
            <SegmentedControl ariaLabel="Template" value={template} options={TEMPLATE_OPTIONS} onChange={setTemplate} fullWidth className={INPUT_CLASS} />
          </ControlRow>

          {/* Fixed two-column rows, so no field is ever left alone in a row. */}
          <div className="grid grid-cols-2 gap-3">
            {template === "event" ? (
              <>
                {text("title", "Title", 60, true)}
                {text("location", "Location", 30, true)}
                {date}
                {time}
              </>
            ) : null}
            {template === "matchup" ? (
              <>
                {text("home", "Home team", 18)}
                {text("away", "Away team", 18)}
                {text("line", "Level and sport", 40, true)}
                {text("location", "Location", 30, true)}
                {date}
                {time}
              </>
            ) : null}
            {template === "final" ? (
              <>
                {text("home", "Home team", 18)}
                {text("away", "Away team", 18)}
                {score("homeScore", "Home score")}
                {score("awayScore", "Away score")}
                {text("line", "Level and sport", 40, true)}
                {text("location", "Location", 30)}
                {date}
              </>
            ) : null}
          </div>

          <ActionDock aria-label="Thumbnail download" className="md:mt-auto md:border-t md:border-border md:pt-4">
            <a href={`/api/live/thumbnail?${params}&download=1`} className={cn(buttonVariants(), "h-11 w-full md:h-9")}>
              <Download aria-hidden />
              Download PNG
              <span className="font-mono-broadcast text-xs font-normal tabular-nums opacity-80">{sizeText}</span>
            </a>
          </ActionDock>
        </div>
      </Panel>

      <Panel padding="md" aria-label="Preview" title="Preview" bodyClassName="flex flex-col">
        <div className="flex flex-1 flex-col gap-4">
          <ControlRow label="Format">
            <SegmentedControl ariaLabel="Format" value={format} options={FORMAT_OPTIONS} onChange={setFormat} fullWidth className={INPUT_CLASS} />
          </ControlRow>

          <div className="flex flex-1 items-center justify-center">
            <div
              className={cn(
                "relative max-w-full overflow-hidden rounded-md bg-[var(--ink-3)]",
                portrait ? "w-full md:h-[min(36rem,70dvh)] md:w-auto" : "w-full"
              )}
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
            >
              <img
                src={`/api/live/thumbnail?${previewParams}`}
                alt="Thumbnail preview"
                className="absolute inset-0 h-full w-full"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setFailed(true);
                }}
              />
              {loading ? (
                <span className="absolute right-2 top-2">
                  <StatusTag spinner>Rendering</StatusTag>
                </span>
              ) : null}
            </div>
          </div>

          {failed ? <InlineError>Couldn&apos;t render the preview. Check the fields and try again.</InlineError> : null}
          {format === "story" ? (
            <p className="text-[13px] leading-snug text-muted-foreground">
              Stories keep the top and bottom 250px clear for Instagram&apos;s buttons. Put the link sticker in the bottom gap.
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
