"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Clapperboard, MonitorUp, MonitorX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CallButton } from "./call-button";

const itemClass =
  "flex min-h-11 w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm text-foreground hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0";

function Item({ icon, title, detail, onSelect }: { icon: ReactNode; title: string; detail: string; onSelect: () => void }) {
  return (
    <button type="button" className={itemClass} onClick={onSelect}>
      {icon}
      <span className="min-w-0">
        <span className="block">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

/**
 * Desktop Share control: share a screen, window or tab (with or without its sound), or watch a
 * package cut together. Screen sharing is left out where the browser can't do it (iPad).
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
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <CallButton label={props.sharing ? "Presenting. Share options" : "Share"} state={props.sharing ? "active" : "on"}>
          <MonitorUp />
        </CallButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          onOpenAutoFocus={pointerSafeAutoFocus}
          side="top"
          sideOffset={12}
          className="z-50 w-80 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-2 text-sm outline-none"
        >
          {props.sharing ? (
            <Item icon={<MonitorX />} title="Stop presenting" detail="Stop sharing your screen" onSelect={run(props.onShare)} />
          ) : props.canShare ? (
            <>
              <Item icon={<MonitorUp />} title="Share screen, window or tab" detail="Everyone sees what you pick" onSelect={run(props.onShare)} />
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 pl-10">
                <span className="min-w-0">
                  <span className="block">Share sound</span>
                  <span className="block text-xs text-muted-foreground">Works best when you share a Chrome tab</span>
                </span>
                <Switch checked={props.shareSound} onCheckedChange={props.onShareSound} aria-label="Share sound" />
              </label>
            </>
          ) : null}
          <div className={props.canShare || props.sharing ? "mt-1 border-t border-[var(--ink-4)] pt-1" : undefined}>
            <Item
              icon={<Clapperboard />}
              title="Watch a package cut"
              detail="An Initial or Final Cut, in sync for everyone"
              onSelect={run(props.onWatch)}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
