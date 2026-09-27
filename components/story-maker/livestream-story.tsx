"use client";

/* eslint-disable @next/next/no-img-element -- the preview is a server-rendered PNG from our own API. */
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { STORY_HEIGHT, STORY_WIDTH, type LivestreamFields } from "@/src/lib/story-maker";
import type { ThumbnailTemplate } from "@/src/lib/live/thumbnail";
import { Segmented, StoryField } from "./story-fields";

const PREVIEW_DEBOUNCE_MS = 400;

export function LivestreamForm({ fields, onChange }: { fields: LivestreamFields; onChange: (next: LivestreamFields) => void }) {
  const set = (key: keyof LivestreamFields) => (value: string) => onChange({ ...fields, [key]: value });
  const input = (key: Exclude<keyof LivestreamFields, "template">, label: string, max: number, hint?: string) => (
    <StoryField id={`ls-${key}`} label={label} hint={hint}>
      <Input id={`ls-${key}`} value={fields[key]} maxLength={max} onChange={(event) => set(key)(event.target.value)} />
    </StoryField>
  );

  return (
    <div className="grid gap-5">
      <Segmented
        label="Layout"
        value={fields.template}
        options={[{ value: "matchup", label: "Matchup" }, { value: "event", label: "Event" }]}
        onChange={(value) => onChange({ ...fields, template: value as ThumbnailTemplate })}
      />
      {fields.template === "matchup" ? (
        <>
          {input("home", "Home team", 18)}
          {input("away", "Away team", 18)}
          {input("line", "Level and sport", 40, "e.g. Varsity Girls Volleyball")}
        </>
      ) : (
        input("title", "Title", 60, "e.g. Senior Night or Spring Concert")
      )}
      {input("location", "Location", 30)}
      <div className="grid grid-cols-2 gap-3">
        <StoryField id="ls-date" label="Date">
          <Input id="ls-date" type="date" value={fields.date} onChange={(event) => set("date")(event.target.value)} />
        </StoryField>
        <StoryField id="ls-time" label="Start time">
          <Input id="ls-time" type="time" value={fields.time} onChange={(event) => set("time")(event.target.value)} />
        </StoryField>
      </div>
      <p className="text-xs text-muted-foreground">
        This is the same design as the thumbnail on the livestream dashboard. Put the link sticker in the gap at the bottom.
      </p>
    </div>
  );
}

/** Debounced server-rendered preview (the thumbnail API renders the PNG). */
export function LivestreamPreview({ query }: { query: string }) {
  const [shown, setShown] = useState(query);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const id = window.setTimeout(() => setShown(query), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);
  useEffect(() => setStatus("loading"), [shown]);

  const src = useMemo(() => `/api/live/thumbnail?${shown}`, [shown]);

  return (
    <div className="relative h-full w-full bg-[#0F110F]">
      <img
        src={src}
        alt="Livestream story preview"
        width={STORY_WIDTH}
        height={STORY_HEIGHT}
        className="absolute inset-0 h-full w-full"
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("failed")}
      />
      {status === "loading" ? (
        <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-soft-white">Rendering…</span>
      ) : null}
      {status === "failed" ? (
        <p role="alert" className="absolute inset-x-3 top-3 rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger">
          Couldn’t render the preview. Check the fields and try again.
        </p>
      ) : null}
    </div>
  );
}
