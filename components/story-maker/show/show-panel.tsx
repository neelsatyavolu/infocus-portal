"use client";

import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import { MAX_SUMMARY_ANNOUNCEMENTS, showSlideName } from "@/src/lib/show-story";
import { MAX_POINTS } from "@/src/lib/story-maker";
import { cn } from "@/src/lib/utils";
import { PhotoInput, StoryField } from "../story-fields";
import type { ShowStoryApi } from "./use-show-story";

const sectionTitle = "text-sm font-semibold text-foreground";

/** Slide switcher above the preview. */
export function ShowSlideTabs({ api, locked }: { api: ShowStoryApi; locked: boolean }) {
  const count = api.draft?.packages.length ?? 0;
  return (
    <div role="group" aria-label="Slides" className="flex flex-wrap gap-1">
      {api.slides.map((slide, index) => (
        <button
          key={index}
          type="button"
          aria-pressed={index === api.slideIndex}
          disabled={locked}
          onClick={() => api.setSlideIndex(index)}
          className={cn(
            "h-8 rounded-md px-3 text-sm font-medium transition-colors",
            index === api.slideIndex ? "bg-[var(--brand-fill)] text-[var(--on-brand)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {index + 1}. {showSlideName(slide, count)}
        </button>
      ))}
    </div>
  );
}

function ShowPicker({ api, locked }: { api: ShowStoryApi; locked: boolean }) {
  const { story } = api;
  const disabled = locked || api.loading || !story;
  return (
    <div className="grid gap-2">
      <StoryField label="Show">
        <div className="flex gap-2">
          <Select value={story?.date} onValueChange={(date) => void api.load(date)} disabled={disabled}>
            <SelectTrigger aria-label="Show date" className="min-w-0 flex-1">
              <SelectValue placeholder={api.loading ? "Loading…" : "Pick a show"} />
            </SelectTrigger>
            <SelectContent>
              {(story?.shows ?? []).map((date) => (
                <SelectItem key={date} value={date}>{formatShowDateLabel(date)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={disabled} onClick={() => void api.load(story?.date)}>
            <RotateCcw />
            Reload
          </Button>
        </div>
      </StoryField>
      <p className="text-xs leading-snug text-muted-foreground">
        Anchors come from Master Calendar and packages from the Publishing Queue. Reload replaces your edits and photos.
      </p>
    </div>
  );
}

function AnnouncementSources({ api }: { api: ShowStoryApi }) {
  const announcements = api.story?.announcements ?? [];
  if (!announcements.length) {
    return <p className="text-xs text-muted-foreground">No announcements were found for this show. Write the lines yourself.</p>;
  }
  const source = api.story?.announcementSource === "teleprompter" ? "from the teleprompter script" : "scheduled for this day (no teleprompter script yet)";
  return (
    <details className="rounded-md border border-border bg-[var(--ink-2)] px-3 py-2 text-sm">
      <summary className="cursor-pointer text-[var(--ink-text)]">
        {announcements.length} {announcements.length === 1 ? "announcement" : "announcements"} {source}
      </summary>
      <ol className="mt-2 grid list-decimal gap-2 pl-5 text-xs leading-snug text-muted-foreground">
        {announcements.map((text, index) => <li key={index}>{text}</li>)}
      </ol>
    </details>
  );
}

/**
 * The Show template's right-hand panel. Focusing a section shows its slide. `locked` while PNGs are
 * being made, so the show and the slide on screen can't change mid-export.
 */
export function ShowPanel({ api, locked }: { api: ShowStoryApi; locked: boolean }) {
  const { draft, story } = api;
  if (api.loadError && !draft) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger">{api.loadError}</p>
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void api.load()}>Try again</Button>
      </div>
    );
  }
  if (!draft || !story) return <p className="text-sm text-muted-foreground">Loading the latest show…</p>;

  const lineCount = draft.points.split("\n").filter((line) => line.trim()).length;
  const show = (index: number) => () => {
    if (!locked) api.setSlideIndex(index);
  };

  return (
    <div className="grid gap-6">
      <ShowPicker api={api} locked={locked} />
      {api.loadError ? <p role="alert" className="text-sm text-danger">{api.loadError}</p> : null}

      <section className="grid gap-4" onFocusCapture={show(0)} aria-label="Recap slide">
        <h3 className={sectionTitle}>1. Recap</h3>
        <StoryField id="show-headline" label="Headline">
          <Input id="show-headline" value={draft.headline} onChange={(event) => api.update({ headline: event.target.value })} />
        </StoryField>
        <StoryField id="show-anchors" label="Anchors" hint={story.anchors.length ? undefined : "No anchors on Master Calendar for this show. Type their names."}>
          <Input id="show-anchors" value={draft.anchors} onChange={(event) => api.update({ anchors: event.target.value })} />
        </StoryField>
        <PhotoInput
          label="Photo of the anchors (optional)"
          photo={draft.recapPhoto}
          onFile={(file) => void api.addPhoto(file, { kind: "recap" })}
          onChange={(recapPhoto) => api.update({ recapPhoto })}
          onRemove={() => api.update({ recapPhoto: null })}
        />
      </section>

      <section className="grid gap-4" onFocusCapture={show(1)} aria-label="Announcements slide">
        <h3 className={sectionTitle}>2. Announcements</h3>
        <StoryField id="show-ann-title" label="Title">
          <Input id="show-ann-title" value={draft.announcementsTitle} onChange={(event) => api.update({ announcementsTitle: event.target.value })} />
        </StoryField>
        <AnnouncementSources api={api} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={locked || api.generating || !story.announcements.length}
          onClick={() => void api.generate()}
        >
          <Sparkles />
          {api.generating ? "Summarizing…" : draft.points.trim() ? "Generate again" : "Generate summaries"}
        </Button>
        {story.announcements.length > MAX_SUMMARY_ANNOUNCEMENTS ? (
          <p className="text-xs text-muted-foreground">Gemini summarizes the first {MAX_SUMMARY_ANNOUNCEMENTS}.</p>
        ) : null}
        <StoryField
          id="show-points"
          label={`Lines, one per announcement (up to ${MAX_POINTS})`}
          hint="Gemini writes a short line for each. Check every line against the original before posting."
        >
          <Textarea id="show-points" rows={5} value={draft.points} onChange={(event) => api.update({ points: event.target.value })} />
        </StoryField>
        {lineCount > MAX_POINTS ? (
          <p role="status" className="text-xs text-[#F2A516] light:text-[#B45309]">
            Only the first {MAX_POINTS} lines fit on the slide. Cut {lineCount - MAX_POINTS}.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4" aria-label="Package slides">
        <h3 className={sectionTitle}>Packages</h3>
        {draft.packages.length === 0 ? (
          <p className="text-xs text-muted-foreground">No packages were queued for this show in the Publishing Queue.</p>
        ) : (
          <>
            <StoryField id="show-pkg-strip" label="Green strip under each frame" hint="Leave it empty to hide it.">
              <Input id="show-pkg-strip" value={draft.packageStrip} onFocus={show(2)} onChange={(event) => api.update({ packageStrip: event.target.value })} />
            </StoryField>
            {draft.packages.map((pkg, index) => (
              <div key={pkg.id} className="grid gap-4 border-t border-border pt-4" onFocusCapture={show(index + 2)}>
                <h4 className="text-xs font-semibold text-[var(--ink-text)]">{index + 3}. {showSlideName({ kind: "package", index }, draft.packages.length)}</h4>
                <StoryField id={`show-pkg-title-${index}`} label="Title">
                  <Textarea id={`show-pkg-title-${index}`} rows={2} value={pkg.title} onChange={(event) => api.updatePackage(index, { title: event.target.value })} />
                </StoryField>
                <StoryField id={`show-pkg-byline-${index}`} label="Reporters">
                  <Input id={`show-pkg-byline-${index}`} value={pkg.byline} onChange={(event) => api.updatePackage(index, { byline: event.target.value })} />
                </StoryField>
                <PhotoInput
                  label="Frame from the package"
                  photo={pkg.photo}
                  onFile={(file) => void api.addPhoto(file, { kind: "package", index })}
                  onChange={(photo) => api.updatePackage(index, { photo })}
                  onRemove={() => api.updatePackage(index, { photo: null })}
                />
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
