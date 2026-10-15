"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Download, Images, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/kit/icon-button";
import { useRememberedState } from "@/components/kit/remembered-state";
import { ManagerRosterButton } from "@/components/manager-roster-button";
import { PageHeader } from "@/components/page-header";
import { CanvasFields } from "@/components/social-story/canvas-fields";
import { useShortcutTitles } from "@/components/social-story/custom-shortcuts";
import { initialState, saveDrafts, templateById, templateDefaults, type EditorState } from "@/components/social-story/editor-drafts";
import { InspectorCard, InspectorSection, InspectorSkeleton } from "@/components/social-story/inspector-section";
import { STORY_SIZE_STATUS, stageStatusItems } from "@/components/social-story/stage-status";
import { StoryStage, scrollToSection } from "@/components/social-story/story-stage";
import { TemplateBar, TemplateRail } from "@/components/social-story/template-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { STORY_HEIGHT, STORY_WIDTH, livestreamThumbnailQuery, storyFileName } from "@/src/lib/story-maker";
import { brandChecks } from "@/src/lib/story-custom";
import { showSlideFileName } from "@/src/lib/show-story";
import { cn } from "@/src/lib/utils";
import { CustomCanvas } from "./custom/custom-canvas";
import { BRAND_CHECK_ID, CustomPanel } from "./custom/custom-panel";
import { useCustomLayout } from "./custom/use-custom-layout";
import { LivestreamForm, LivestreamPreview } from "./livestream-story";
import { SLIDES_ID, ShowPanel } from "./show/show-panel";
import { ShowSlideArt } from "./show/show-slides";
import { useShowStory } from "./show/use-show-story";
import { StoryCanvas } from "./story-canvas";
import { TOUCH_HEIGHT } from "./story-fields";
import { readStoryPhoto } from "./story-photos";
import { STORY_TEMPLATES, isFieldVisible, type StoryPhoto, type StoryTemplate, type StoryValues } from "./story-templates";

/** Remembered per browser (kit prefix `infocus:ui:`). */
const SAFE_ZONES_KEY = "story-maker:safe-zones:v1";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * The page root is a size container from md (`story`; not on phones, where it would trap the
 * fixed action bar), so the columns follow the room the editor actually has, whatever the
 * sidebar takes.
 */
const EDITOR_ROOT = "space-y-5 md:@container/story";
/**
 * Editor columns. The preview's width matches StoryFrame's own height bound with room for the
 * stage's chrome: sticky at 5rem + about 11.25rem of actions, status line, switch and up to three
 * hint lines = 17rem. `svh`, so the columns don't re-flow while a browser toolbar collapses.
 * The template rail joins as a third column only from a 74rem editor: rail 12rem + preview up to
 * 26rem + gaps still leaves the fields a 30rem inside (where short fields pair up), so the fields
 * never get narrower than they are without the rail.
 */
const EDITOR_GRID = cn(
  "grid min-w-0 gap-5 md:gap-x-5 md:gap-y-3",
  "[--preview-w:max(15rem,min(22rem,calc((100svh_-_17rem)*9/16)))] @min-[74rem]/story:[--preview-w:max(15rem,min(26rem,calc((100svh_-_17rem)*9/16)))]",
  "md:grid-cols-[var(--preview-w)_minmax(0,1fr)] md:grid-rows-[auto_1fr]",
  "@min-[74rem]/story:grid-cols-[12rem_var(--preview-w)_minmax(0,1fr)]"
);
/**
 * Sticky only on screens tall enough to hold the whole stage (the 15rem-wide preview needs about
 * 44rem with its chrome); on shorter ones (landscape phones, small tablets) it scrolls with the page.
 */
const STAGE_STICKY = "md:[@media(min-height:44rem)]:sticky";
const RAIL_STICKY = "@min-[74rem]/story:[@media(min-height:44rem)]:sticky";
const STICKY_TOP = "top-[calc(var(--app-header-h,4rem)_+_1rem)]";

function triggerDownload(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
}

/**
 * Instagram Post Maker. Templates | preview (sticky, with Download on top) | fields. In a narrower
 * editor the template list becomes a Select at the head of the fields column; on phones it is one
 * column and the download row is a bar above the tab bar.
 * `canAppoint`: producers can appoint and remove social media managers from here.
 */
export function StoryMaker({ canAppoint }: { canAppoint: boolean }) {
  const [state, setState] = useState<EditorState | null>(null);
  const [showSafeZones, setShowSafeZones] = useRememberedState(SAFE_ZONES_KEY, false, isBoolean);
  const [overflow, setOverflow] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Phone-only bottom padding that keeps the end of the page clear of the fixed action bar. */
  const [barRoom, setBarRoom] = useState(0);
  const storyRef = useRef<HTMLDivElement>(null);
  const fontCssRef = useRef<string | null>(null);
  const titles = useShortcutTitles();

  // Drafts and today's date come from the browser, so load them after mount (no hydration mismatch).
  useEffect(() => setState(initialState()), []);
  useEffect(() => {
    if (state) saveDrafts(state);
  }, [state]);

  const template: StoryTemplate = templateById(state?.current ?? STORY_TEMPLATES[0].id);
  const values = state && template.kind === "canvas" ? state.values[template.id] : null;
  const livestreamQuery = useMemo(() => (state ? livestreamThumbnailQuery(state.livestream) : ""), [state]);
  const custom = useCustomLayout(template.kind === "custom");
  const show = useShowStory(template.kind === "show");
  const showFitKey = useMemo(() => ({ draft: show.draft, slide: show.slideIndex }), [show.draft, show.slideIndex]);
  const brandIssues = useMemo(
    () => (template.kind === "custom" ? brandChecks(custom.layout, custom.measured) : []),
    [template.kind, custom.layout, custom.measured]
  );
  const handleOverflow = useCallback((next: boolean) => setOverflow(next), []);

  const setValue = (key: string, value: string | StoryPhoto | null) =>
    setState((current) =>
      current ? { ...current, values: { ...current.values, [current.current]: { ...current.values[current.current], [key]: value } } } : current
    );

  function selectTemplate(id: string) {
    if (busy) return;
    setState((current) => (current ? { ...current, current: id } : current));
  }

  async function addPhoto(key: string, file: File) {
    try {
      setValue(key, await readStoryPhoto(file));
    } catch {
      toast.error("Couldn’t open that photo. Use a JPG or PNG (export iPhone HEIC photos as JPG first).");
    }
  }

  function resetText() {
    if (template.kind !== "canvas" || !values) return;
    const { id } = template;
    const before = values;
    setState((current) => {
      if (!current) return current;
      const photos = Object.fromEntries(template.fields.filter((f) => f.type === "photo").map((f) => [f.key, current.values[template.id][f.key]]));
      return { ...current, values: { ...current.values, [template.id]: { ...templateDefaults(template), ...photos } } };
    });
    toast("Sample text is back.", { action: { label: "Undo", onClick: () => restoreText(id, before) } });
  }

  /** Undo for Reset text: the text (and layout choice) from before; photos stay as they are now. */
  function restoreText(id: string, before: StoryValues) {
    const text = Object.fromEntries(Object.entries(before).filter((entry) => typeof entry[1] === "string"));
    setState((current) => (current ? { ...current, values: { ...current.values, [id]: { ...current.values[id], ...text } } } : current));
  }

  async function renderPng(node: HTMLDivElement) {
    const { getFontEmbedCSS, toPng } = await import("html-to-image");
    fontCssRef.current ??= await getFontEmbedCSS(node);
    return toPng(node, {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      pixelRatio: 1,
      backgroundColor: "#0F110F",
      fontEmbedCSS: fontCssRef.current
    });
  }

  async function downloadCanvas() {
    const node = storyRef.current;
    if (!node || template.kind === "livestream") return;
    setBusy(true);
    flushSync(() => setExporting(true));
    try {
      const fileName = template.kind === "show" && show.story
        ? showSlideFileName(show.story.date, show.slide, show.slideIndex)
        : storyFileName(template.id, new Date());
      triggerDownload(await renderPng(node), fileName);
      toast.success("Story downloaded.");
    } catch (error) {
      console.error("Story export failed", error);
      toast.error("Couldn’t make the PNG. Try again, or use a smaller photo.");
    } finally {
      setExporting(false);
      setBusy(false);
    }
  }

  /** Renders each Show slide in turn and downloads it, then returns to the slide that was open. */
  async function downloadAllSlides() {
    const { story, slides, slideIndex } = show;
    if (!story) return;
    setBusy(true);
    flushSync(() => setExporting(true));
    try {
      for (const [index, slide] of slides.entries()) {
        flushSync(() => show.setSlideIndex(index));
        const node = storyRef.current;
        if (!node) throw new Error("Story preview is missing.");
        triggerDownload(await renderPng(node), showSlideFileName(story.date, slide, index));
      }
      toast.success(`${slides.length} slides downloaded.`);
    } catch (error) {
      console.error("Show slides export failed", error);
      toast.error("Couldn’t make every PNG. Try again, or download the slides one at a time.");
    } finally {
      show.setSlideIndex(slideIndex);
      setExporting(false);
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (template.kind === "custom" || template.kind === "show") {
      const photo = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith("image/"));
      if (photo) void (template.kind === "custom" ? custom.dropPhoto(photo) : show.addPhoto(photo));
      return;
    }
    if (template.kind !== "canvas" || !values) return;
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    const slots = template.fields.filter((field) => field.type === "photo" && isFieldVisible(field, values));
    if (!file || !slots.length) return;
    void addPhoto((slots.find((slot) => !values[slot.key]) ?? slots[0]).key, file);
  }

  const drop = {
    onDragOver: (event: DragEvent) => {
      if (template.kind === "livestream") return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop
  };

  const status = state
    ? stageStatusItems({
        kind: template.kind,
        canvasMounted: template.kind === "show" ? Boolean(show.draft && show.story) : Boolean(values),
        overflow,
        show,
        brandIssueCount: brandIssues.length,
        onBrandIssues: () => scrollToSection(BRAND_CHECK_ID),
        onSlides: () => scrollToSection(SLIDES_ID)
      })
    : [STORY_SIZE_STATUS];
  const hint = !state ? null : template.kind === "canvas" ? (
    "Drag a photo onto the preview to add it."
  ) : template.kind === "show" ? (
    "Drag a photo onto the preview to add it to this slide (a package frame, or the recap photo)."
  ) : template.kind === "custom" ? (
    // The shortcuts live in the fields (Selected, or Shortcuts at the end); phones can't drop files.
    <span className="pointer-coarse:hidden">Drop a photo on the story to add it.</span>
  ) : null;

  const primaryClass = cn(TOUCH_HEIGHT, "min-w-0 flex-1");
  /** Beside Undo/Redo or "All N", the bar is tight on phones: "Download" until there's room for the rest. */
  const primaryRest = template.kind === "show" ? " slide" : template.kind === "custom" ? " PNG" : null;
  const actions =
    template.kind === "livestream" ? (
      <a href={`/api/live/thumbnail?${livestreamQuery}&download=1`} className={cn(buttonVariants(), primaryClass)}>
        <Download />
        <span className="truncate">Download PNG</span>
      </a>
    ) : (
      <>
        {template.kind === "custom" ? (
          <>
            <IconButton label={titles.undo} icon={Undo2} variant="outline" size="touch" disabled={!custom.canUndo} onClick={custom.undo} />
            <IconButton label={titles.redo} icon={Redo2} variant="outline" size="touch" disabled={!custom.canRedo} onClick={custom.redo} />
          </>
        ) : null}
        {template.kind === "show" ? (
          <Button
            type="button"
            variant="outline"
            className={cn(TOUCH_HEIGHT, "shrink-0")}
            aria-label={`Download all ${show.slides.length}`}
            onClick={() => void downloadAllSlides()}
            disabled={!show.draft || busy}
          >
            <Images />
            <span className="hidden @min-[22rem]:inline">Download all {show.slides.length}</span>
            <span className="@min-[22rem]:hidden">All {show.slides.length}</span>
          </Button>
        ) : null}
        <Button
          type="button"
          className={primaryClass}
          aria-label={!busy && primaryRest ? `Download${primaryRest}` : undefined}
          onClick={() => void downloadCanvas()}
          disabled={!state || busy || (template.kind === "show" && !show.draft)}
        >
          <Download />
          <span className="truncate">
            {busy ? (
              "Making PNG…"
            ) : primaryRest ? (
              <>
                Download<span className="hidden @min-[19rem]:inline">{primaryRest}</span>
              </>
            ) : (
              "Download PNG"
            )}
          </span>
        </Button>
      </>
    );

  const restartAction =
    template.kind === "canvas" ? (
      <Button type="button" variant="ghost" className={cn(TOUCH_HEIGHT, "shrink-0")} disabled={busy} onClick={resetText}>
        <RotateCcw />
        Reset text
      </Button>
    ) : template.kind === "custom" ? (
      <Button type="button" variant="ghost" className={cn(TOUCH_HEIGHT, "shrink-0")} disabled={busy} onClick={custom.startOver}>
        <RotateCcw />
        Start over
      </Button>
    ) : null;

  return (
    <div className={EDITOR_ROOT} style={barRoom ? { paddingBottom: barRoom } : undefined}>
      <PageHeader
        size="compact"
        eyebrow={
          <>
            <Link href={"/managers" as never} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              <ArrowLeft aria-hidden className="h-3 w-3" />
              Managers
            </Link>
            <span aria-hidden>·</span>
            <span>Social media</span>
          </>
        }
        title="Instagram Post Maker"
        description="On-brand Instagram stories, 1080 × 1920 PNG. Photos stay on this device."
        actions={
          canAppoint ? (
            <ManagerRosterButton
              endpoint="/api/managers/social-media"
              noun="social media managers"
              title="Social media managers"
              description="Social media managers can use the Instagram Post Maker. Producers can always use it and manage this list."
              size="default"
            />
          ) : undefined
        }
      />

      <div className={EDITOR_GRID}>
        <TemplateRail
          templates={STORY_TEMPLATES}
          currentId={state ? template.id : null}
          onSelect={selectTemplate}
          disabled={busy}
          className={cn(
            "hidden @min-[74rem]/story:col-start-1 @min-[74rem]/story:row-span-2 @min-[74rem]/story:row-start-1 @min-[74rem]/story:grid @min-[74rem]/story:self-start",
            RAIL_STICKY,
            STICKY_TOP
          )}
        />

        <TemplateBar
          templates={STORY_TEMPLATES}
          template={state ? template : null}
          onSelect={selectTemplate}
          disabled={busy}
          action={restartAction}
          className="md:col-start-2 md:row-start-1 @min-[74rem]/story:col-start-3"
        />

        <StoryStage
          actions={actions}
          status={status}
          hint={hint}
          showSafeZones={showSafeZones}
          onShowSafeZonesChange={setShowSafeZones}
          onBarRoomChange={setBarRoom}
          dragging={dragging}
          drop={drop}
          className={cn("md:col-start-1 md:row-span-2 md:row-start-1 md:self-start @min-[74rem]/story:col-start-2", STAGE_STICKY, STICKY_TOP)}
        >
          {template.kind === "livestream" ? (
            <LivestreamPreview query={livestreamQuery} />
          ) : template.kind === "custom" ? (
            <StoryCanvas storyRef={storyRef} exporting={exporting} fitKey={custom.layout} onOverflowChange={handleOverflow}>
              <CustomCanvas api={custom} />
            </StoryCanvas>
          ) : template.kind === "show" ? (
            show.draft && show.story ? (
              <StoryCanvas storyRef={storyRef} exporting={exporting} fitKey={showFitKey} onOverflowChange={handleOverflow}>
                <ShowSlideArt slide={show.slide} draft={show.draft} date={show.story.date} hasAnnouncements={show.story.announcements.length > 0 || Boolean(show.draft.points.trim())} />
              </StoryCanvas>
            ) : null
          ) : values ? (
            <StoryCanvas storyRef={storyRef} exporting={exporting} fitKey={values} onOverflowChange={handleOverflow}>
              {template.render(values)}
            </StoryCanvas>
          ) : null}
        </StoryStage>

        <InspectorCard className="md:col-start-2 md:row-start-2 @min-[74rem]/story:col-start-3">
          {!state ? (
            <InspectorSkeleton label="Loading your drafts" />
          ) : template.kind === "custom" ? (
            <CustomPanel api={custom} issues={brandIssues} />
          ) : template.kind === "show" ? (
            <ShowPanel api={show} locked={busy} />
          ) : template.kind === "livestream" ? (
            // Inputs at the phone touch height, like every other template's fields.
            <InspectorSection title="Details" className="max-md:[&_input]:h-10">
              <LivestreamForm fields={state.livestream} onChange={(livestream) => setState({ ...state, livestream })} />
            </InspectorSection>
          ) : values ? (
            <CanvasFields template={template} values={values} setValue={setValue} addPhoto={(key, file) => void addPhoto(key, file)} />
          ) : null}
        </InspectorCard>
      </div>
    </div>
  );
}
