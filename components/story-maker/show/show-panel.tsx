"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { Alert, InlineError } from "@/components/kit/alert";
import { rovingIndex } from "@/components/kit/roving";
import { StatusTag } from "@/components/kit/status-tag";
import { INSPECTOR_BODY_CLASS, InspectorSection, InspectorSkeleton } from "@/components/social-story/inspector-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import { MAX_SUMMARY_ANNOUNCEMENTS, showSlideName, type ShowSlide } from "@/src/lib/show-story";
import { MAX_POINTS } from "@/src/lib/story-maker";
import { cn } from "@/src/lib/utils";
import { PhotoInput, StoryField, TOUCH_HEIGHT } from "../story-fields";
import type { ShowStoryApi } from "./use-show-story";

const PANEL_ID = "show-slide-panel";
/** The slide tabs' section, so the "Slide N of M" tag above the preview can jump to it. */
export const SLIDES_ID = "show-slides";
const tabId = (index: number) => `show-slide-tab-${index}`;
const noteClass = "text-xs leading-snug text-muted-foreground";

function ShowPicker({ api, locked }: { api: ShowStoryApi; locked: boolean }) {
  const { story } = api;
  const disabled = locked || api.loading || !story;
  return (
    <InspectorSection title="Show">
      <div className="grid gap-1.5">
        <div className="flex min-w-0 gap-2">
          <Select value={story?.date} onValueChange={(date) => void api.load(date)} disabled={disabled}>
            <SelectTrigger aria-label="Show date" className={cn(TOUCH_HEIGHT, "min-w-0 flex-1 text-base md:text-sm")}>
              <SelectValue placeholder={api.loading ? "Loading…" : "Pick a show"} />
            </SelectTrigger>
            <SelectContent>
              {(story?.shows ?? []).map((date) => (
                <SelectItem key={date} value={date}>{formatShowDateLabel(date)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className={TOUCH_HEIGHT} disabled={disabled} onClick={() => void api.load(story?.date)}>
            <RotateCcw />
            Reload
          </Button>
        </div>
        <p className={noteClass}>
          Anchors come from Master Calendar and packages from the Publishing Queue. Choosing another show or pressing Reload replaces your edits and photos.
        </p>
      </div>
      {api.loadError ? <InlineError>{api.loadError}</InlineError> : null}
    </InspectorSection>
  );
}

/**
 * Columns that fill every row: all the slides in one row when they fit, otherwise rows of two,
 * with an odd last slide spanning both. A show has 2–4 slides (up to 2 packages); more still wrap.
 */
function tabColumns(count: number) {
  if (count <= 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-2 @min-[28rem]:grid-cols-3";
  if (count === 4) return "grid-cols-2 @min-[37rem]:grid-cols-4";
  return "grid-cols-2";
}

/** An odd last slide spans both columns of a two-column row (and one cell once all 3 fit a row). */
function lastTabSpan(index: number, count: number) {
  if (count % 2 === 0 || index !== count - 1) return undefined;
  return count === 3 ? "col-span-2 @min-[28rem]:col-span-1" : "col-span-2";
}

/**
 * Tabs for the slides. They switch the slide in the preview and the fields below together.
 * Equal cells in rows that fill (nothing scrolls out of sight); ←/→/Home/End move between them.
 */
function SlideTabs({ api, current, locked }: { api: ShowStoryApi; current: number; locked: boolean }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const count = api.draft?.packages.length ?? 0;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(index, event.key, api.slides.map(() => locked));
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    api.setSlideIndex(next);
  }

  return (
    <div role="tablist" aria-label="Slides" className={cn("grid gap-0.5 rounded-md border border-input p-0.5", tabColumns(api.slides.length))}>
      {api.slides.map((slide, index) => {
        const selected = index === current;
        const name = showSlideName(slide, count);
        return (
          <button
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tabId(index)}
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            title={`${index + 1}. ${name}`}
            disabled={locked}
            onClick={() => api.setSlideIndex(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "flex h-[34px] min-w-0 items-center gap-1.5 rounded-[4px] px-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed md:h-[30px]",
              lastTabSpan(index, api.slides.length),
              selected
                ? "bg-[var(--brand-fill)] font-medium text-[var(--on-brand)]"
                : "text-muted-foreground enabled:hover:bg-[var(--ink-3)] enabled:hover:text-foreground disabled:opacity-60"
            )}
          >
            <span className="font-mono-broadcast text-xs tabular-nums opacity-80">{index + 1}</span>
            <span className="truncate">{name}</span>
          </button>
        );
      })}
    </div>
  );
}

function AnnouncementSources({ api }: { api: ShowStoryApi }) {
  const announcements = api.story?.announcements ?? [];
  if (!announcements.length) {
    return <p className={noteClass}>No announcements were found for this show. Write the lines yourself.</p>;
  }
  const source = api.story?.announcementSource === "teleprompter" ? "from the teleprompter script" : "scheduled for this day (no teleprompter script yet)";
  return (
    <details className="rounded-md border border-border bg-background px-3 py-2 text-sm">
      <summary className="cursor-pointer text-[var(--ink-text)]">
        {announcements.length} {announcements.length === 1 ? "announcement" : "announcements"} {source}
      </summary>
      <ol className="mt-2 grid list-decimal gap-2 pl-5 text-xs leading-snug text-muted-foreground">
        {announcements.map((text, index) => <li key={index}>{text}</li>)}
      </ol>
    </details>
  );
}

type SlideProps = { api: ShowStoryApi; locked: boolean };

function RecapFields({ api }: SlideProps) {
  const { draft, story } = api;
  if (!draft || !story) return null;
  return (
    <>
      <StoryField id="show-headline" label="Headline">
        <Input id="show-headline" className={TOUCH_HEIGHT} value={draft.headline} onChange={(event) => api.update({ headline: event.target.value })} />
      </StoryField>
      <StoryField id="show-anchors" label="Anchors" hint={story.anchors.length ? undefined : "No anchors on Master Calendar for this show. Type their names."}>
        <Input id="show-anchors" className={TOUCH_HEIGHT} value={draft.anchors} onChange={(event) => api.update({ anchors: event.target.value })} />
      </StoryField>
      <PhotoInput
        label="Photo of the anchors (optional)"
        photo={draft.recapPhoto}
        onFile={(file) => void api.addPhoto(file, { kind: "recap" })}
        onChange={(recapPhoto) => api.update({ recapPhoto })}
        onRemove={() => api.update({ recapPhoto: null })}
      />
    </>
  );
}

function AnnouncementFields({ api, locked }: SlideProps) {
  const { draft, story } = api;
  if (!draft || !story) return null;
  const lineCount = draft.points.split("\n").filter((line) => line.trim()).length;
  const over = lineCount > MAX_POINTS;
  return (
    <>
      <StoryField id="show-ann-title" label="Title">
        <Input id="show-ann-title" className={TOUCH_HEIGHT} value={draft.announcementsTitle} onChange={(event) => api.update({ announcementsTitle: event.target.value })} />
      </StoryField>
      <AnnouncementSources api={api} />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button
          type="button"
          variant="outline"
          className={TOUCH_HEIGHT}
          disabled={locked || api.generating || !story.announcements.length}
          onClick={() => void api.generate()}
        >
          <Sparkles />
          {api.generating ? "Summarizing…" : draft.points.trim() ? "Generate again" : "Generate summaries"}
        </Button>
        {story.announcements.length > MAX_SUMMARY_ANNOUNCEMENTS ? (
          <p className={noteClass}>Gemini summarizes the first {MAX_SUMMARY_ANNOUNCEMENTS}.</p>
        ) : null}
      </div>
      <StoryField
        id="show-points"
        label={`Lines, one per announcement (up to ${MAX_POINTS})`}
        hint="Gemini writes a short line for each. Check every line against the original before posting."
        trailing={
          <span className={cn("shrink-0 font-mono-broadcast text-[11px] tabular-nums", over ? "text-brand-amber" : "text-muted-foreground")}>
            {lineCount} / {MAX_POINTS}
          </span>
        }
      >
        <Textarea id="show-points" rows={5} value={draft.points} onChange={(event) => api.update({ points: event.target.value })} />
      </StoryField>
      {over ? (
        <p role="status" className="text-xs text-brand-amber">
          Only the first {MAX_POINTS} lines fit on the slide. Cut {lineCount - MAX_POINTS}.
        </p>
      ) : null}
    </>
  );
}

function PackageFields({ api, index }: SlideProps & { index: number }) {
  const pkg = api.draft?.packages[index];
  if (!api.draft || !pkg) return null;
  return (
    <>
      <StoryField id={`show-pkg-title-${index}`} label="Title">
        <Textarea id={`show-pkg-title-${index}`} rows={2} value={pkg.title} onChange={(event) => api.updatePackage(index, { title: event.target.value })} />
      </StoryField>
      <StoryField id={`show-pkg-byline-${index}`} label="Reporters">
        <Input id={`show-pkg-byline-${index}`} className={TOUCH_HEIGHT} value={pkg.byline} onChange={(event) => api.updatePackage(index, { byline: event.target.value })} />
      </StoryField>
      <PhotoInput
        key={pkg.id}
        label="Frame from the package"
        photo={pkg.photo}
        onFile={(file) => void api.addPhoto(file, { kind: "package", index })}
        onChange={(photo) => api.updatePackage(index, { photo })}
        onRemove={() => api.updatePackage(index, { photo: null })}
      />
      <StoryField id="show-pkg-strip" label="Green strip under each frame" hint="Same strip on every package slide. Leave it empty to hide it.">
        <Input id="show-pkg-strip" className={TOUCH_HEIGHT} value={api.draft.packageStrip} onChange={(event) => api.update({ packageStrip: event.target.value })} />
      </StoryField>
    </>
  );
}

function SlideFields({ slide, ...props }: SlideProps & { slide: ShowSlide }) {
  if (slide.kind === "recap") return <RecapFields {...props} />;
  if (slide.kind === "announcements") return <AnnouncementFields {...props} />;
  return <PackageFields {...props} index={slide.index} />;
}

/**
 * The Show template's fields: the show picker, then the slide tabs heading the fields of the
 * slide on screen (only that slide's). `locked` while PNGs are being made: the show, the tabs and the generate button
 * can't change, and the fields stay on the slide that was open when the export started (Download
 * all flips the preview through every slide).
 */
export function ShowPanel({ api, locked }: { api: ShowStoryApi; locked: boolean }) {
  const { draft, story } = api;
  const [frozenSlide, setFrozenSlide] = useState<number | null>(null);
  if (locked && frozenSlide === null) setFrozenSlide(api.slideIndex);
  if (!locked && frozenSlide !== null) setFrozenSlide(null);

  if (api.loadError && !draft) {
    return (
      <Alert
        tone="danger"
        title="The show didn’t load"
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void api.load()}>
            Try again
          </Button>
        }
      >
        {api.loadError}
      </Alert>
    );
  }
  if (!draft || !story) return <InspectorSkeleton label="Loading the latest show" note="Loading the latest show…" bars={2} />;

  const shown = Math.min(locked && frozenSlide !== null ? frozenSlide : api.slideIndex, api.slides.length - 1);
  const slide = api.slides[shown];
  const announcementTag =
    slide.kind === "announcements" && story.announcements.length ? (
      <StatusTag tone="neutral" size="sm">{story.announcementSource === "teleprompter" ? "Teleprompter" : "Scheduled"}</StatusTag>
    ) : null;

  return (
    <div className={INSPECTOR_BODY_CLASS}>
      <ShowPicker api={api} locked={locked} />
      <InspectorSection id={SLIDES_ID} title="Slides" tag={announcementTag}>
        <SlideTabs api={api} current={shown} locked={locked} />
        {draft.packages.length === 0 ? <p className={noteClass}>No packages were queued for this show in the Publishing Queue.</p> : null}
        <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(shown)} className="grid min-w-0 gap-4">
          <SlideFields slide={slide} api={api} locked={locked} />
        </div>
      </InspectorSection>
    </div>
  );
}
