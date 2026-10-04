"use client";

import * as Popover from "@radix-ui/react-popover";
import { Settings } from "lucide-react";
import { CallButton } from "./call-button";
import { DevicePickers } from "./device-pickers";
import { LevelMeter } from "./level-meter";
import type { LocalMedia } from "./use-local-media";

/** Gear button with a compact popover: microphone, camera, speaker and the mic level. */
export function DevicePopover({ media, micTrack }: { media: LocalMedia; micTrack: MediaStreamTrack | undefined }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <CallButton label="Audio and video settings">
          <Settings />
        </CallButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={12}
          collisionPadding={16}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-4"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Audio and video</p>
          <DevicePickers media={media} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <LevelMeter track={micTrack} />
            <span>{media.audioOn ? "Speak to test your microphone" : "Turn on your mic to test it"}</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
