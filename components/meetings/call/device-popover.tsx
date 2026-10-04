"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import * as Popover from "@radix-ui/react-popover";
import { Settings } from "lucide-react";
import { CallButton } from "./call-button";
import { LevelMeter } from "./level-meter";
import { AudioSettings, VideoSettings } from "./settings-sections";
import type { LocalMedia } from "./use-local-media";

/**
 * Pre-join gear: compact Audio (mic level from the preview's processed track) and Video
 * (camera, background, mirror). The pre-join preview already shows the camera and blur.
 */
export function DevicePopover({ media, micTrack }: { media: LocalMedia; micTrack: MediaStreamTrack | undefined }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <CallButton label="Audio and video settings">
          <Settings />
        </CallButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content onOpenAutoFocus={pointerSafeAutoFocus}
          side="top"
          align="center"
          sideOffset={12}
          collisionPadding={16}
          className="z-50 max-h-[min(36rem,calc(100dvh-6rem))] w-[min(22rem,calc(100vw-2rem))] space-y-4 overflow-y-auto overscroll-contain rounded-md outline-none border border-[var(--ink-4)] bg-[var(--ink-2)] p-4"
        >
          <AudioSettings media={media} showMeter={false} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <LevelMeter track={micTrack} />
            <span>{media.audioOn ? "Speak to test your microphone" : "Turn on your mic to test it"}</span>
          </div>
          <div className="h-px bg-[var(--ink-4)]" aria-hidden />
          <VideoSettings media={media} showPreview={false} showQuality={false} peopleCount={0} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
