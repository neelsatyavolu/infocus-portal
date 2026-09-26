"use client";

import { useEffect, useState } from "react";
import type { LiveImageState } from "@/src/lib/live/graphics";
import type { ScoreboardState } from "@/src/lib/live/scoreboard";
import type { LiveEventSummary } from "@/src/server/live-graphics";
import { LiveGraphic } from "./live-graphic";
import { LiveImageLayer } from "./live-image-layer";
import { LiveStage, useLiveNow, useServerOffset } from "./live-stage";
import { Scorebug } from "./scorebug";

type OverlayPayload = {
  event: LiveEventSummary;
  scoreboard: ScoreboardState;
  liveImage: LiveImageState;
  serverNow: number;
};

const POLL_MS = 1000;

/**
 * OBS Browser Source page. Polls the overlay endpoint every second and keeps the last good
 * state on network errors, so a blip never blanks the stream.
 */
export function LiveOverlay({ overlayKey, kind }: { overlayKey: string; kind: "scoreboard" | "image" }) {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [missing, setMissing] = useState(false);
  const { offset, sample } = useServerOffset();
  const now = useLiveNow(offset, kind === "scoreboard" ? 100 : 250);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const sentAt = Date.now();
        const response = await fetch(`/api/live/overlay/${encodeURIComponent(overlayKey)}`, { cache: "no-store" });
        if (response.status === 404) {
          if (!cancelled) setMissing(true);
        } else if (response.ok) {
          const body = (await response.json()) as { data: OverlayPayload };
          if (!cancelled) {
            sample(sentAt, Date.now(), body.data.serverNow);
            setMissing(false);
            setPayload(body.data);
          }
        }
      } catch {
        // Keep showing the last state.
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, POLL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [overlayKey, sample]);

  return (
    <>
      <style>{"html,body{background:transparent!important;overflow:hidden}"}</style>
      <div className="fixed inset-0">
        {missing ? null : payload ? (
          <LiveStage>
            {kind === "scoreboard" ? (
              <div className="lv-play">
                <Scorebug state={payload.scoreboard} now={now} />
              </div>
            ) : (
              <LiveImageLayer
                liveImage={payload.liveImage}
                render={(image) => (
                  <LiveGraphic graphic={image.graphic} fields={image.fields} scoreboard={payload.scoreboard} event={payload.event} now={now} />
                )}
              />
            )}
          </LiveStage>
        ) : null}
      </div>
    </>
  );
}
