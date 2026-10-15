"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Clapperboard, MonitorUp, MonitorX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/src/lib/utils";
import { CallButton } from "./call-button";
import { MENU_SURFACE, MenuDivider, MenuRow } from "./menu-row";

/**
 * Desktop Share control: share a screen, window or tab (with or without its sound), or watch a
 * package cut together. Where the browser can't share a screen (iPad), watching is the only thing
 * left, so the button is "Watch a package cut" itself, with no menu.
 */
export function ShareMenu(props: {
  canShare: boolean;
  sharing: boolean;
  shareSound: boolean;
  onShareSound: (on: boolean) => void;
  onShare: () => void;
  onWatch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  if (!props.canShare && !props.sharing) {
    return (
      <CallButton label="Watch a package cut" onClick={props.onWatch}>
        <Clapperboard />
      </CallButton>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <CallButton label={props.sharing ? "Presenting. Share options" : "Share"} state={props.sharing ? "active" : "on"}>
          <MonitorUp />
        </CallButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content onOpenAutoFocus={pointerSafeAutoFocus} side="top" sideOffset={12} className={cn(MENU_SURFACE, "w-80")}>
          {props.sharing ? (
            <MenuRow icon={<MonitorX />} title="Stop presenting" detail="Stop sharing your screen" onSelect={run(props.onShare)} />
          ) : props.canShare ? (
            <>
              <MenuRow icon={<MonitorUp />} title="Share screen, window or tab" detail="Everyone sees what you pick" onSelect={run(props.onShare)} />
              {/* Indented to the row text (12px pad + 16px icon + 12px gap). */}
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md py-2 pl-10 pr-3 hover:bg-[var(--ink-3)]">
                <span className="min-w-0">
                  <span className="block">Share sound</span>
                  <span className="block text-xs text-muted-foreground">Works best when you share a Chrome tab</span>
                </span>
                <Switch checked={props.shareSound} onCheckedChange={props.onShareSound} aria-label="Share sound" />
              </label>
            </>
          ) : null}
          {props.canShare || props.sharing ? <MenuDivider /> : null}
          <MenuRow
            icon={<Clapperboard />}
            title="Watch a package cut"
            detail="An Initial or Final Cut, in sync for everyone"
            onSelect={run(props.onWatch)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
