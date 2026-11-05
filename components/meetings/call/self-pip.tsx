"use client";

import { useState } from "react";
import { MicOff } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { HandBadge } from "./hand-badge";
import { OVERLAY_CHIP } from "./overlay";
import { VideoView } from "./media-elements";

type Corner = "br" | "bl" | "tl" | "tr";

const CORNER_CLASS: Record<Corner, string> = {
  br: "bottom-4 right-4",
  bl: "bottom-4 left-4",
  tl: "top-4 left-4",
  tr: "top-4 right-4"
};

/**
 * With a participant strip on stage the tile sits clear of it: the strip is a 112px row along the
 * bottom in portrait (bottom corners move up) and a 160px column on the right in landscape (right
 * corners move left).
 */
function cornerClass(corner: Corner, strip: boolean, landscape: boolean): string {
  if (!strip) return CORNER_CLASS[corner];
  if (!landscape) return corner === "br" ? "bottom-32 right-4" : corner === "bl" ? "bottom-32 left-4" : CORNER_CLASS[corner];
  return corner === "br" ? "bottom-4 right-44" : corner === "tr" ? "top-4 right-44" : CORNER_CLASS[corner];
}

const NEXT: Record<Corner, Corner> = { br: "bl", bl: "tl", tl: "tr", tr: "br" };

/** Phone self view: a small corner tile over the stage. Tap moves it to the next corner. */
export function SelfPip({
  track,
  videoOn,
  audioOn,
  name,
  landscape,
  handPosition,
  mirror = true,
  strip = false
}: {
  track: MediaStreamTrack | undefined;
  videoOn: boolean;
  audioOn: boolean;
  name: string;
  landscape: boolean;
  handPosition?: number;
  mirror?: boolean;
  /** A participant strip is on stage (sidebar layout): keep the tile clear of it. */
  strip?: boolean;
}) {
  const [corner, setCorner] = useState<Corner>("br");
  return (
    <button
      type="button"
      onClick={() => setCorner((c) => NEXT[c])}
      aria-label="Your camera. Tap to move it to another corner."
      className={cn(
        "absolute z-10 overflow-hidden rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]",
        landscape ? "h-20 w-32" : "h-32 w-24",
        handPosition ? "outline outline-2 outline-[#F2A516]" : undefined,
        cornerClass(corner, strip, landscape)
      )}
    >
      {videoOn && track ? (
        <VideoView track={track} mirror={mirror} />
      ) : (
        <span className="flex h-full items-center justify-center px-1 text-center text-[11px] text-muted-foreground">{name}</span>
      )}
      {handPosition ? <HandBadge position={handPosition} compact className="absolute left-1 top-1" /> : null}
      {!audioOn ? (
        <span className={cn("absolute bottom-1 left-1 p-0.5", OVERLAY_CHIP)}>
          <MicOff className="h-3.5 w-3.5" aria-label="Microphone off" />
        </span>
      ) : null}
    </button>
  );
}
