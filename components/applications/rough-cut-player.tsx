"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { Film } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { VideoPlayer } from "@/components/kit/video-player";

async function fetchPlaybackUrl(roundId: string) {
  const response = await fetch(`/api/applications/rounds/${roundId}/rough-cut`, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as { data?: { url: string | null } } | null;
  if (!response.ok) throw new Error("load failed");
  return body?.data?.url ?? null;
}

/**
 * The rough cut. Applicants get a short-lived playback URL from the API (signed-in only); reviewers
 * pass `src` from the server. A failed load asks for a fresh URL once (signed URLs expire).
 */
export function RoughCutPlayer({
  roundId,
  src,
  videoRef,
  className
}: {
  roundId: string;
  src?: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(src ?? null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(src ? "ready" : "loading");
  const [retried, setRetried] = useState(false);

  const load = useCallback(
    (isCancelled: () => boolean = () => false) =>
      fetchPlaybackUrl(roundId)
        .then((next) => {
          if (isCancelled()) return;
          setUrl(next);
          setState(next ? "ready" : "missing");
        })
        .catch(() => {
          if (!isCancelled()) setState("error");
        }),
    [roundId]
  );

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load, src]);

  if (state === "loading") return <div className="aspect-video w-full animate-pulse rounded-md bg-[var(--ink-3)]" aria-label="Loading the rough cut" />;
  if (state === "missing" || state === "error" || !url) {
    return (
      <EmptyState
        icon={Film}
        title={state === "error" ? "Couldn't load the rough cut" : "The rough cut isn't posted yet"}
        description={state === "error" ? "Refresh the page to try again." : "Check back soon. You can fill in the other sections meanwhile."}
      />
    );
  }
  return (
    <VideoPlayer
      ref={videoRef}
      src={url}
      label="Rough cut"
      className={className}
      onError={() => {
        if (retried) return;
        setRetried(true);
        void load();
      }}
    />
  );
}
