"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { VideoPlayer } from "@/components/kit/video-player";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { NasUploadFields } from "@/src/lib/nas-upload-client";
import { SHOW_THUMBNAIL_SECONDS } from "@/src/lib/show-publication";
import {
  ACTIVE,
  LoadingView,
  PickView,
  PublicationTag,
  ReviewForm,
  StatusView,
  ThumbnailPreview,
  UploadingView,
  type Form,
  type Publication
} from "./show-upload-parts";

type Defaults = {
  title: string;
  description: string;
  publishDate: string;
  publishTime: string;
  seasonNumber: number | null;
  existingSeasons: number[] | null;
};

type State = { showDate: string; configured: boolean; publication: Publication | null; defaults: Defaults | null };
type Phase = "loading" | "pick" | "uploading" | "review" | "status";

const THUMBNAIL_MAX_WIDTH = 1280;

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? fallback);
  return body.data;
}

async function captureThumbnail(file: File, seconds: number) {
  const { captureVideoThumbnail } = await import("@/src/lib/video-thumbnail-client");
  return captureVideoThumbnail(file, seconds, { exact: true, maxWidth: THUMBNAIL_MAX_WIDTH });
}

function formFromDefaults(defaults: Defaults): Form {
  return {
    title: defaults.title,
    description: defaults.description,
    publishDate: defaults.publishDate,
    publishTime: defaults.publishTime,
    seasonNumber: defaults.seasonNumber ? String(defaults.seasonNumber) : ""
  };
}

function seasonHintFor(existingSeasons: number[] | null, season: string | undefined) {
  const seasonNumber = Number(season);
  if (!existingSeasons) return "Couldn't read playlists from YouTube. Check the number.";
  return Number.isInteger(seasonNumber) && seasonNumber > 0 && !existingSeasons.includes(seasonNumber)
    ? `New playlist: "InFocus News | Season ${seasonNumber}" will be created.`
    : "Adds to the existing playlist.";
}

/** An automatic edit that is already the show's draft: review it here instead of picking a file. */
export type EditedShow = { videoUrl: string; posterUrl: string | null };

export function ShowUploadDialog({
  open,
  onOpenChange,
  showDate,
  showLabel,
  edited = null,
  onScheduled
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showDate: string;
  showLabel: string;
  edited?: EditedShow | null;
  onScheduled?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<State | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [thumbnailSeconds, setThumbnailSeconds] = useState(String(SHOW_THUMBNAIL_SECONDS));
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      fetch(`/api/show-roles/publication?date=${encodeURIComponent(showDate)}`, { cache: "no-store" })
        .then((response) => readJson<State>(response, "Could not load the show upload."))
        .then((next) => {
          setState(next);
          return next;
        }),
    [showDate]
  );

  // Each opening (or another show) starts over (adjusted during render; the load runs below).
  const [startedFor, setStartedFor] = useState<{ open: boolean; load: typeof load; onOpenChange: typeof onOpenChange } | null>(
    null
  );
  if (!startedFor || startedFor.open !== open || startedFor.load !== load || startedFor.onOpenChange !== onOpenChange) {
    setStartedFor({ open, load, onOpenChange });
    if (open) {
      setPhase("loading");
      setFile(null);
      setThumbnail(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    load()
      .then((next) => {
        if (next.publication && next.publication.status !== "DRAFT") return setPhase("status");
        // The edited file is already the draft: straight to the title/time form.
        if (edited && next.defaults) {
          setForm(formFromDefaults(next.defaults));
          return setPhase("review");
        }
        setPhase("pick");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not load the show upload.");
        onOpenChange(false);
      });
  }, [open, load, onOpenChange, edited]);

  const publicationStatus = state?.publication?.status;
  useEffect(() => {
    if (!open || phase !== "status" || !publicationStatus || !ACTIVE.has(publicationStatus)) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void load().catch(() => {});
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [open, phase, publicationStatus, load]);

  async function retakeThumbnail(source: File, seconds: number) {
    setCapturing(true);
    try {
      setThumbnail(await captureThumbnail(source, seconds));
    } catch {
      toast.error("Could not grab a frame there. Try another time, or YouTube will pick one.");
    } finally {
      setCapturing(false);
    }
  }

  async function startUpload(picked: File) {
    setFile(picked);
    setProgress(0);
    setPhase("uploading");
    void retakeThumbnail(picked, SHOW_THUMBNAIL_SECONDS);
    try {
      const init = await readJson<{ upload: NasUploadFields }>(
        await fetch("/api/show-roles/publication", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "init", showDate, fileName: picked.name })
        }),
        "Could not start the upload."
      );
      const { uploadFileToNas } = await import("@/src/lib/nas-upload-client");
      await uploadFileToNas(picked, init.upload, (sent, total) => {
        if (total) setProgress((sent / total) * 100);
      });
      const next = await load();
      if (!next.defaults) throw new Error("This show was already sent to YouTube.");
      setForm(formFromDefaults(next.defaults));
      setPhase("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
      setPhase("pick");
    }
  }

  async function schedule() {
    if (!form) return;
    const seasonNumber = Number(form.seasonNumber);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
      toast.error("Enter a season number.");
      return;
    }
    setSubmitting(true);
    try {
      if (thumbnail) {
        const body = new FormData();
        body.set("showDate", showDate);
        body.set("file", thumbnail, "poster.jpg");
        await readJson(await fetch("/api/show-roles/publication/poster", { method: "POST", body }), "Could not save the thumbnail.");
      }
      const next = await readJson<State>(
        await fetch("/api/show-roles/publication", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", showDate, ...form, seasonNumber })
        }),
        "Could not schedule the show."
      );
      setState(next);
      setPhase("status");
      onScheduled?.();
      toast.success("Sent to YouTube. It uploads in the background.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule the show.");
    } finally {
      setSubmitting(false);
    }
  }

  const publication = state?.publication ?? null;
  // Widens when a file is picked (thumbnail beside progress, then beside the form), never mid-step.
  const wide = phase === "uploading" || phase === "review";
  const reviewingEdit = Boolean(edited) && !file;
  const preview = reviewingEdit && edited ? (
    <VideoPlayer
      src={edited.videoUrl}
      poster={edited.posterUrl}
      preload="metadata"
      className="rounded-md border border-border"
      label="The edited show"
    />
  ) : (
    <ThumbnailPreview file={thumbnail} capturing={capturing} />
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (phase === "uploading" && !next ? undefined : onOpenChange(next))}>
      {/* The upload can't be interrupted, so there is no close button while it runs. */}
      <DialogContent hideClose={phase === "uploading"} className={wide ? "sm:max-w-3xl" : "sm:max-w-xl"}>
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-center gap-2 pr-8 sm:justify-start">
            <DialogTitle>Upload show</DialogTitle>
            {phase === "status" && publication ? (
              <span aria-live="polite" className="inline-flex">
                <PublicationTag status={publication.status} />
              </span>
            ) : null}
          </div>
          <DialogDescription>{showLabel}</DialogDescription>
        </DialogHeader>

        {phase === "loading" ? <LoadingView /> : null}

        {phase === "pick" ? (
          <PickView
            configured={Boolean(state?.configured)}
            onChoose={() => inputRef.current?.click()}
            input={
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = "";
                  if (picked) void startUpload(picked);
                }}
              />
            }
          />
        ) : null}

        {phase === "uploading" ? <UploadingView fileName={file?.name ?? ""} progress={progress} thumbnail={preview} /> : null}

        {phase === "review" && form ? (
          <ReviewForm
            form={form}
            setForm={setForm}
            seasonHint={seasonHintFor(state?.defaults?.existingSeasons ?? null, form.seasonNumber)}
            thumbnail={preview}
            thumbnailSeconds={thumbnailSeconds}
            onThumbnailSecondsChange={setThumbnailSeconds}
            canRetake={Boolean(file) && !capturing}
            onRetake={() => file && void retakeThumbnail(file, Math.max(0, Number(thumbnailSeconds) || 0))}
            retakeControls={!reviewingEdit}
          />
        ) : null}

        {phase === "status" && publication ? <StatusView publication={publication} /> : null}

        {phase === "review" ? (
          <DialogFooter sticky>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setPhase("pick")}>
              Choose a different file
            </Button>
            <Button type="button" disabled={submitting || capturing || !form?.title.trim()} onClick={() => void schedule()}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Schedule on YouTube
            </Button>
          </DialogFooter>
        ) : null}

        {phase === "status" && publication?.watchUrl ? (
          <DialogFooter>
            <a
              href={publication.watchUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              <ExternalLink aria-hidden />
              Open on YouTube
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
