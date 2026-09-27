/* eslint-disable @next/next/no-img-element -- the preview is a server-rendered PNG from our own API. */
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  THUMBNAIL_SIZES,
  pacificDateTimeInputs,
  parseEventTitle,
  type ThumbnailFormat,
  type ThumbnailTemplate
} from "@/src/lib/live/thumbnail";
import type { LiveEventSummary } from "@/src/server/live-graphics";
import { FieldLabel, Panel, Seg } from "./live-controls";

const TEMPLATE_OPTIONS = [
  { value: "matchup", label: "A · Matchup" },
  { value: "event", label: "C · Event" }
] as const;
const FORMAT_OPTIONS = [
  { value: "youtube", label: "YouTube" },
  { value: "post", label: "Instagram post" },
  { value: "story", label: "Instagram story" }
] as const;

const PREVIEW_DEBOUNCE_MS = 400;

export function ThumbnailPanel({ event }: { event: LiveEventSummary }) {
  const parsed = useMemo(() => parseEventTitle(event.title), [event.title]);
  const start = useMemo(() => pacificDateTimeInputs(event.startsAt), [event.startsAt]);
  const [template, setTemplate] = useState<ThumbnailTemplate>(parsed.isMatchup ? "matchup" : "event");
  const [format, setFormat] = useState<ThumbnailFormat>("youtube");
  const [fields, setFields] = useState({
    home: parsed.home.slice(0, 18),
    away: parsed.away.slice(0, 18),
    line: parsed.line.slice(0, 40),
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
  const set = (key: keyof typeof fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const text = (key: keyof typeof fields, label: string, max: number) => (
    <FieldLabel label={label}>
      <Input id={`thumb-${key}`} value={fields[key]} maxLength={max} onChange={(changeEvent) => set(key)(changeEvent.target.value)} />
    </FieldLabel>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.4fr)]">
      <Panel title="Thumbnail">
        <div className="flex flex-wrap gap-2">
          <Seg label="Template" value={template} options={TEMPLATE_OPTIONS} onChange={setTemplate} />
          <Seg label="Format" value={format} options={FORMAT_OPTIONS} onChange={setFormat} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {template === "matchup" ? (
            <>
              {text("home", "Home team", 18)}
              {text("away", "Away team", 18)}
              {text("line", "Level and sport", 40)}
            </>
          ) : (
            <div className="sm:col-span-2">{text("title", "Title", 60)}</div>
          )}
          {text("location", "Location", 30)}
          <FieldLabel label="Date">
            <Input id="thumb-date" type="date" value={fields.date} onChange={(changeEvent) => set("date")(changeEvent.target.value)} />
          </FieldLabel>
          <FieldLabel label="Start time">
            <Input id="thumb-time" type="time" value={fields.time} onChange={(changeEvent) => set("time")(changeEvent.target.value)} />
          </FieldLabel>
        </div>
        <a
          href={`/api/live/thumbnail?${params}&download=1`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-[var(--brand-fill-hover)]"
        >
          Download PNG · {size.width} × {size.height}
        </a>
        {format === "story" ? (
          <p className="text-xs text-muted-foreground">Stories keep the top and bottom 250px clear for Instagram&apos;s buttons. Put the link sticker in the bottom gap.</p>
        ) : null}
      </Panel>

      <Panel title={`Preview · ${size.label}`}>
        <div className={`mx-auto w-full ${format === "youtube" ? "" : format === "post" ? "max-w-[440px]" : "max-w-[330px]"}`}>
          <div className="relative w-full overflow-hidden rounded-md bg-[#0F110F]" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
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
            {loading ? <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-soft-white">Rendering…</span> : null}
          </div>
        </div>
        {failed ? <p className="text-sm text-danger">Couldn&apos;t render the preview. Check the fields and try again.</p> : null}
      </Panel>
    </div>
  );
}
