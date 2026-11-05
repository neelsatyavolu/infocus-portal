"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import * as Popover from "@radix-ui/react-popover";
import { Settings } from "lucide-react";
import { CallButton } from "./call-button";
import { micTestLabel } from "@/src/lib/meetings/client/mic-monitor";
import { LevelMeter } from "./level-meter";
import { MENU_SURFACE } from "./menu-row";
import { AudioSettings, VideoSettings } from "./settings-sections";
import type { LocalMedia } from "./use-local-media";
import { cn } from "@/src/lib/utils";

/**
 * Pre-join gear: compact Audio (mic level from the preview's processed track) and Video
 * (camera, background, mirror), in the same section recipe as the in-call settings dialog.
 * The pre-join preview already shows the camera and blur. Device lists load only when it opens.
 */
export function DevicePopover({ media, micTrack }: { media: LocalMedia; micTrack: MediaStreamTrack | undefined }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <CallButton surface="video" label="Audio and video settings">
          <Settings />
        </CallButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          onOpenAutoFocus={pointerSafeAutoFocus}
          side="top"
          align="center"
          sideOffset={12}
          collisionPadding={16}
          className={cn(
            MENU_SURFACE,
            "max-h-[min(36rem,calc(100dvh-6rem))] w-[min(22rem,calc(100vw-2rem))] space-y-5 overflow-y-auto overscroll-contain p-4"
          )}
        >
          <div className="grid gap-4">
            <AudioSettings media={media} showMeter={false} />
            <div className="flex min-h-9 items-center gap-3 rounded-md bg-[var(--ink-3)] px-3 text-xs text-muted-foreground">
              <LevelMeter track={micTrack} />
              <span>{micTestLabel(media.audioOn)}</span>
            </div>
          </div>
          <VideoSettings media={media} showPreview={false} showQuality={false} peopleCount={0} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
