"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { isHlsPlaylistUrl } from "@/src/lib/video-buffer";

type HlsInstance = {
  destroy: () => void;
  loadSource: (src: string) => void;
};

/**
 * Attaches a playback URL to the review <video>. Drive MP4s (and HLS where the browser plays it
 * natively) use `src`; other HLS playlists lazy-load hls.js with retries and fatal-error recovery.
 */
export function useHlsPlayer(videoRef: RefObject<HTMLVideoElement | null>, playbackUrl: string | null | undefined) {
  const hlsRef = useRef<HlsInstance | null>(null);
  const playbackUrlRef = useRef(playbackUrl);
  useLayoutEffect(() => {
    playbackUrlRef.current = playbackUrl;
  });

  const attachHls = useCallback(async (video: HTMLVideoElement, url: string) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Drive MP4s play natively (Range requests); only HLS playlists need hls.js.
    if (!isHlsPlaylistUrl(url) || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return;
    }

    try {
      const { default: Hls } = await import("hls.js");

      if (playbackUrlRef.current !== url) {
        return;
      }

      if (!Hls.isSupported()) {
        video.src = url;
        return;
      }

      const hls = new Hls({
        startLevel: -1,
        capLevelToPlayerSize: true,
        abrEwmaDefaultEstimate: 2_000_000,
        maxBufferLength: 60,
        backBufferLength: 90,
        enableWorker: true,
        startFragPrefetch: true,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        nudgeMaxRetry: 10
      });
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          if (hlsRef.current === (hls as unknown as HlsInstance)) {
            hlsRef.current = null;
          }
        }
      });

      hlsRef.current = hls as unknown as HlsInstance;
    } catch {
      video.src = url;
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) {
      return;
    }

    void attachHls(video, playbackUrl);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoRef, playbackUrl, attachHls]);
}
