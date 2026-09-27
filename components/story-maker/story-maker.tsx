"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Download, Images, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ManagerRosterButton } from "@/components/manager-roster-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  defaultLivestreamFields,
  livestreamThumbnailQuery,
  storyFileName,
  type LivestreamFields
} from "@/src/lib/story-maker";
import { showSlideFileName } from "@/src/lib/show-story";
import { cn } from "@/src/lib/utils";
import { CustomCanvas } from "./custom/custom-canvas";
import { CustomPanel } from "./custom/custom-panel";
import { useCustomLayout } from "./custom/use-custom-layout";
import { LivestreamForm, LivestreamPreview } from "./livestream-story";
import { ShowPanel, ShowSlideTabs } from "./show/show-panel";
import { ShowSlideArt } from "./show/show-slides";
import { useShowStory } from "./show/use-show-story";
import { StoryCanvas, StoryFrame } from "./story-canvas";
import { PhotoInput, Segmented, StoryField } from "./story-fields";
import { readStoryPhoto } from "./story-photos";
import {
  STORY_TEMPLATES,
  fieldDefault,
  isFieldVisible,
  type CanvasTemplate,
  type StoryPhoto,
  type StoryTemplate,
  type StoryValues
} from "./story-templates";

const STORE_KEY = "infocus-story-maker:v1";
type SavedDrafts = { current?: string; text?: Record<string, Record<string, string>> };
type EditorState = { current: string; values: Record<string, StoryValues>; livestream: LivestreamFields };

const canvasTemplates = STORY_TEMPLATES.filter((t): t is CanvasTemplate => t.kind === "canvas");
const templateById = (id: string) => STORY_TEMPLATES.find((t) => t.id === id) ?? STORY_TEMPLATES[0];

function templateDefaults(template: CanvasTemplate): StoryValues {
  return Object.fromEntries(template.fields.map((field) => [field.key, fieldDefault(field)]));
}

function readSaved(): SavedDrafts {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") as SavedDrafts;
  } catch {
    return {};
  }
}

/** Text drafts are remembered in this browser; photos are not (they can be large). */
function saveDrafts(state: EditorState) {
  const text = Object.fromEntries(
    Object.entries(state.values).map(([id, values]) => [
      id,
      Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    ])
  );
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ current: state.current, text }));
  } catch {
    // Private windows can block storage; drafts just won't be remembered.
  }
}

function initialState(): EditorState {
  const saved = readSaved();
  const values = Object.fromEntries(
    canvasTemplates.map((template) => {
      const savedText = saved.text?.[template.id] ?? {};
      const known = Object.fromEntries(Object.entries(savedText).filter(([key]) => template.fields.some((f) => f.key === key && f.type !== "photo")));
      return [template.id, { ...templateDefaults(template), ...known }];
    })
  );
  const current = STORY_TEMPLATES.some((t) => t.id === saved.current) ? (saved.current as string) : STORY_TEMPLATES[0].id;
  return { current, values, livestream: defaultLivestreamFields(new Date()) };
}

function triggerDownload(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
}

/** `canAppoint`: producers can appoint and remove social media managers from here. */
export function StoryMaker({ canAppoint }: { canAppoint: boolean }) {
  const [state, setState] = useState<EditorState | null>(null);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const storyRef = useRef<HTMLDivElement>(null);
  const fontCssRef = useRef<string | null>(null);

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
  const handleOverflow = useCallback((next: boolean) => setOverflow(next), []);

  const setValue = (key: string, value: string | StoryPhoto | null) =>
    setState((current) =>
      current ? { ...current, values: { ...current.values, [current.current]: { ...current.values[current.current], [key]: value } } } : current
    );

  async function addPhoto(key: string, file: File) {
    try {
      setValue(key, await readStoryPhoto(file));
    } catch {
      toast.error("Couldn’t open that photo. Use a JPG or PNG (export iPhone HEIC photos as JPG first).");
    }
  }

  function resetText() {
    if (template.kind !== "canvas") return;
    setState((current) => {
      if (!current) return current;
      const photos = Object.fromEntries(template.fields.filter((f) => f.type === "photo").map((f) => [f.key, current.values[template.id][f.key]]));
      return { ...current, values: { ...current.values, [template.id]: { ...templateDefaults(template), ...photos } } };
    });
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

  return (
    <div className="route-enter mx-auto w-full max-w-[1760px] space-y-5 pb-28">
      <section className="brand-hero-panel relative overflow-hidden p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Managers · Social media</p>
            <h1 className="mt-3 text-[32px] font-semibold leading-none text-foreground md:text-[44px]" style={{ letterSpacing: "-0.025em" }}>
              Instagram Post Maker
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-text)]">
              On-brand Instagram stories at 1080 × 1920. Pick a template, add a photo, write the text, and download a PNG. Photos stay on this device.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canAppoint ? (
              <ManagerRosterButton
                endpoint="/api/managers/social-media"
                noun="social media managers"
                title="Social media managers"
                description="Social media managers can use the Instagram Post Maker. Producers can always use it and manage this list."
              />
            ) : null}
            <Link href={"/managers" as never} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ArrowLeft />
              All managers
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Story templates" className="flex gap-1 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
          {STORY_TEMPLATES.map((t) => {
            const active = t.id === template.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setState((current) => (current ? { ...current, current: t.id } : current))}
                className={cn(
                  "shrink-0 rounded-md px-3 py-2.5 text-left transition-colors",
                  active ? "bg-[var(--brand-fill)] text-[var(--on-brand)]" : "text-muted-foreground hover:bg-card hover:text-foreground"
                )}
              >
                <span className="block text-sm font-semibold">{t.name}</span>
                <span className={cn("mt-0.5 hidden text-xs leading-snug xl:block", active ? "text-[var(--on-brand)] opacity-80" : "text-muted-foreground")}>
                  {t.description}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_360px]">
          <section
            aria-label="Preview"
            className={cn("grid content-start gap-3 rounded-md border border-border bg-card p-4", dragging && "outline-dashed outline-2 outline-[var(--brand-green)]")}
            onDragOver={(event) => {
              if (template.kind === "livestream") return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch id="safe-zones" checked={showSafeZones} onCheckedChange={setShowSafeZones} />
                <label htmlFor="safe-zones" className="text-sm text-[var(--ink-text)]">Show Instagram’s UI zones</label>
              </div>
              {template.kind === "livestream" ? (
                <a href={`/api/live/thumbnail?${livestreamQuery}&download=1`} className={buttonVariants()}>
                  <Download />
                  Download PNG
                </a>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {template.kind === "show" ? (
                    <Button type="button" variant="outline" onClick={() => void downloadAllSlides()} disabled={!show.draft || busy}>
                      <Images />
                      Download all {show.slides.length}
                    </Button>
                  ) : null}
                  <Button type="button" onClick={() => void downloadCanvas()} disabled={!state || busy || (template.kind === "show" && !show.draft)}>
                    <Download />
                    {busy ? "Making PNG…" : template.kind === "show" ? "Download slide" : "Download PNG"}
                  </Button>
                </div>
              )}
            </div>

            {template.kind === "show" && show.draft ? <ShowSlideTabs api={show} locked={busy} /> : null}

            {overflow && (template.kind === "canvas" || template.kind === "show") ? (
              <div role="status" className="flex items-start gap-2 rounded-md border border-[#F2A516]/50 bg-[#F2A516]/10 px-3 py-2 text-sm">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#F2A516] light:text-[#B45309]" />
                <span>Some text is too long to fit, even after shrinking. Shorten it before you download.</span>
              </div>
            ) : null}

            <StoryFrame showSafeZones={showSafeZones}>
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
            </StoryFrame>
            {template.kind === "canvas" ? (
              <p className="text-center text-xs text-muted-foreground">Tip: drag a photo onto the preview to add it.</p>
            ) : template.kind === "show" ? (
              <p className="text-center text-xs text-muted-foreground">Tip: drag a photo onto the preview to add it to this slide (a package frame, or the recap photo).</p>
            ) : template.kind === "custom" ? (
              <p className="text-center text-xs text-muted-foreground">Drag pieces to move them · green handle resizes · arrow keys nudge · ⌘Z undoes · drop a photo to add it</p>
            ) : null}
          </section>

          <section aria-label="Story text and photos" className="grid content-start gap-5 rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{template.name}</h2>
              {template.kind === "canvas" ? (
                <Button type="button" variant="ghost" size="sm" onClick={resetText}>
                  Reset text
                </Button>
              ) : null}
            </div>

            {!state ? null : template.kind === "custom" ? (
              <CustomPanel api={custom} />
            ) : template.kind === "show" ? (
              <ShowPanel api={show} locked={busy} />
            ) : template.kind === "livestream" ? (
              <LivestreamForm fields={state.livestream} onChange={(livestream) => setState({ ...state, livestream })} />
            ) : values ? (
              template.fields
                .filter((field) => isFieldVisible(field, values))
                .map((field) => {
                  const id = `story-${template.id}-${field.key}`;
                  const value = values[field.key];
                  if (field.type === "photo") {
                    return (
                      <PhotoInput
                        key={id}
                        label={field.label}
                        photo={value && typeof value === "object" ? value : null}
                        onFile={(file) => void addPhoto(field.key, file)}
                        onChange={(photo) => setValue(field.key, photo)}
                        onRemove={() => setValue(field.key, null)}
                      />
                    );
                  }
                  if (field.type === "select") {
                    return <Segmented key={id} label={field.label} value={String(value ?? field.def)} options={field.options} onChange={(next) => setValue(field.key, next)} />;
                  }
                  const Control = field.type === "textarea" ? Textarea : Input;
                  return (
                    <StoryField key={id} id={id} label={field.label} hint={field.hint}>
                      <Control
                        id={id}
                        value={typeof value === "string" ? value : ""}
                        rows={field.type === "textarea" ? (field.rows ?? 3) : undefined}
                        onChange={(event) => setValue(field.key, event.target.value)}
                      />
                    </StoryField>
                  );
                })
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
