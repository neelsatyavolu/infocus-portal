"use client";

import { useState } from "react";
import { MicOff } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { VideoView } from "./media-elements";

type Corner = "br" | "bl" | "tl" | "tr";

const CORNER_CLASS: Record<Corner, string> = {
  br: "bottom-4 right-4",
  bl: "bottom-4 left-4",
  tl: "top-4 left-4",
  tr: "top-4 right-4"
};

const NEXT: Record<Corner, Corner> = { br: "bl", bl: "tl", tl: "tr", tr: "br" };

/** Phone self view: a small corner tile over the stage. Tap moves it to the next corner. */
export function SelfPip({
  track,
  videoOn,
  audioOn,
  name,
  landscape
}: {
  track: MediaStreamTrack | undefined;
  videoOn: boolean;
  audioOn: boolean;
  name: string;
  landscape: boolean;
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
        CORNER_CLASS[corner]
      )}
    >
      {videoOn && track ? (
        <VideoView track={track} mirror />
      ) : (
        <span className="flex h-full items-center justify-center px-1 text-center text-[11px] text-muted-foreground">{name}</span>
      )}
      {!audioOn ? (
        <span className="absolute bottom-1 left-1 rounded-sm bg-black/55 p-0.5 text-soft-white">
          <MicOff className="h-3.5 w-3.5" aria-label="Microphone off" />
        </span>
      ) : null}
    </button>
  );
}
