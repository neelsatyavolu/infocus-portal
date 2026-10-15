import { TriangleAlert } from "lucide-react";
import type { ShowStoryApi } from "@/components/story-maker/show/use-show-story";
import type { StoryTemplate } from "@/components/story-maker/story-templates";
import type { StageStatusItem } from "./story-stage";

export const OVERFLOW_MESSAGE = "Some text is too long to fit, even after shrinking. Shorten it before you download.";

type ShowState = Pick<ShowStoryApi, "loadError" | "draft" | "story" | "loading" | "generating" | "slideIndex" | "slides">;

/** What the status line shows when nothing else applies, so it is never an empty band. */
export const STORY_SIZE_STATUS: StageStatusItem = { key: "size", tone: "neutral", label: "1080 × 1920" };

/**
 * The tags above the preview for the open template (StoryStage sorts them by severity):
 * the Show's load error, loading, summarizing and slide position (a link to the slide tabs, which
 * sit below the preview on phones); text that doesn't fit (only while a canvas is on screen,
 * since that's what reports it; the tag is the only place it shows); the Custom brand check.
 * Otherwise the story's size.
 */
export function stageStatusItems({
  kind,
  canvasMounted,
  overflow,
  show,
  brandIssueCount,
  onBrandIssues,
  onSlides
}: {
  kind: StoryTemplate["kind"];
  /** A canvas or Show slide is on screen, so `overflow` is current. */
  canvasMounted: boolean;
  overflow: boolean;
  show: ShowState;
  brandIssueCount: number;
  onBrandIssues: () => void;
  onSlides: () => void;
}): StageStatusItem[] {
  const isShow = kind === "show";
  const items: Array<StageStatusItem | false> = [
    isShow && Boolean(show.loadError) && !show.draft && { key: "show-error", tone: "danger", label: "Show didn’t load", detail: show.loadError ?? undefined },
    overflow && canvasMounted && (kind === "canvas" || isShow) && {
      key: "overflow",
      tone: "warning",
      label: "Text too long",
      icon: TriangleAlert,
      detail: OVERFLOW_MESSAGE
    },
    kind === "custom" &&
      (brandIssueCount
        ? {
            key: "brand",
            tone: "warning",
            label: `${brandIssueCount} brand ${brandIssueCount === 1 ? "check" : "checks"}`,
            detail: "Show the Brand check list",
            onClick: onBrandIssues
          }
        : { key: "brand", tone: "success", label: "On brand" }),
    isShow && show.loading && { key: "show-loading", tone: "neutral", label: "Loading show…", spinner: true },
    isShow && show.generating && { key: "generating", tone: "neutral", label: "Summarizing…", spinner: true },
    isShow &&
      Boolean(show.draft) && {
        key: "slide",
        tone: "neutral",
        label: `Slide ${Math.min(show.slideIndex, show.slides.length - 1) + 1} of ${show.slides.length}`,
        detail: "Go to the slide tabs",
        onClick: onSlides
      }
  ];
  const shown = items.filter((item): item is StageStatusItem => Boolean(item));
  return shown.length ? shown : [STORY_SIZE_STATUS];
}
