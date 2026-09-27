"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_SUMMARY_ANNOUNCEMENTS, joinNames, packageByline, showSlides, type ShowSlide, type ShowStoryResponse } from "@/src/lib/show-story";
import type { StoryPhoto } from "@/src/lib/story-maker";
import { readStoryPhoto } from "../story-photos";

const ENDPOINT = "/api/managers/social-media/show";

export type ShowPackageDraft = { id: string; title: string; byline: string; photo: StoryPhoto | null };
/** Everything on the slides. Starts from the loaded show and is edited freely; never saved. */
export type ShowDraft = {
  headline: string;
  anchors: string;
  recapPhoto: StoryPhoto | null;
  announcementsTitle: string;
  points: string;
  /** Green strip under each package frame. */
  packageStrip: string;
  packages: ShowPackageDraft[];
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

function draftFrom(story: ShowStoryResponse): ShowDraft {
  return {
    headline: "Today on InFocus",
    anchors: joinNames(story.anchors),
    recapPhoto: null,
    announcementsTitle: "Around Paly",
    points: "",
    packageStrip: "Now on YouTube",
    packages: story.packages.map((pkg) => ({ id: pkg.id, title: pkg.title, byline: packageByline(pkg.reporters), photo: null }))
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !body.data) throw new Error(body.error?.message || "Something went wrong. Try again.");
  return body.data;
}

/** State for the Show template. Loads the latest show the first time the template is opened. */
export function useShowStory(active: boolean) {
  const [story, setStory] = useState<ShowStoryResponse | null>(null);
  const [draft, setDraft] = useState<ShowDraft | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const requested = useRef(false);

  const load = useCallback(async (date?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await readJson<ShowStoryResponse>(await fetch(date ? `${ENDPOINT}?date=${date}` : ENDPOINT, { cache: "no-store" }));
      setStory(next);
      setDraft(draftFrom(next));
      setSlideIndex(0);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn’t load that show.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    void load();
  }, [active, load]);

  const slides: ShowSlide[] = useMemo(() => showSlides(draft?.packages.length ?? 0), [draft?.packages.length]);
  const slide = slides[Math.min(slideIndex, slides.length - 1)];

  const update = useCallback((patch: Partial<ShowDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current)), []);
  const updatePackage = useCallback(
    (index: number, patch: Partial<ShowPackageDraft>) =>
      setDraft((current) =>
        current ? { ...current, packages: current.packages.map((pkg, i) => (i === index ? { ...pkg, ...patch } : pkg)) } : current
      ),
    []
  );

  async function generate() {
    const announcements = story?.announcements.slice(0, MAX_SUMMARY_ANNOUNCEMENTS) ?? [];
    if (!announcements.length) return;
    setGenerating(true);
    try {
      const { summaries } = await readJson<{ summaries: string[] }>(
        await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ announcements }) })
      );
      update({ points: summaries.filter(Boolean).join("\n") });
      setSlideIndex(1);
      toast.success("Summaries ready. Check them against the originals before posting.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t summarize the announcements.");
    } finally {
      setGenerating(false);
    }
  }

  /** Photos go to the slide on screen: that package's frame, otherwise the recap photo. */
  async function addPhoto(file: File, target: ShowSlide = slide) {
    try {
      const photo = await readStoryPhoto(file);
      if (target.kind === "package") {
        updatePackage(target.index, { photo });
        return;
      }
      update({ recapPhoto: photo });
      setSlideIndex(0);
    } catch {
      toast.error("Couldn’t open that photo. Use a JPG or PNG (export iPhone HEIC photos as JPG first).");
    }
  }

  return {
    story, draft, slides, slide, slideIndex, setSlideIndex, loading, loadError, generating,
    load, update, updatePackage, generate, addPhoto
  };
}

export type ShowStoryApi = ReturnType<typeof useShowStory>;
