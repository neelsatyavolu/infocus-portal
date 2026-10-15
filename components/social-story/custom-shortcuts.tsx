"use client";

import { Fragment, useSyncExternalStore } from "react";
import { Kbd, shortcutKeys } from "@/components/kit/kbd";
import { cn } from "@/src/lib/utils";

function detectApple() {
  if (typeof navigator === "undefined") return true;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const subscribeNever = () => () => undefined;

/** Modifier names for this device (kit `shortcutKeys`): ⌘ ⌥ ⇧ on Apple, Ctrl Alt Shift elsewhere. */
export function useShortcutKeys() {
  const apple = useSyncExternalStore(subscribeNever, detectApple, () => true);
  const [mod, alt, shift] = shortcutKeys("mod+alt+shift", apple);
  return { mod, alt, shift, join: apple ? "" : "+" };
}

/** "Undo (⌘Z)" / "Undo (Ctrl+Z)". */
export function useShortcutTitles() {
  const { mod, shift, join } = useShortcutKeys();
  const combo = (...keys: string[]) => keys.join(join);
  return {
    undo: `Undo (${combo(mod, "Z")})`,
    redo: `Redo (${combo(shift, mod, "Z")})`,
    duplicate: `Duplicate (${combo(mod, "D")})`
  };
}

type Row = { keys?: string[][]; gesture?: string; action: string };

function ShortcutRows({ rows, label, className }: { rows: Row[]; label: string; className?: string }) {
  return (
    <dl aria-label={label} className={cn("grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-xs", className)}>
      {rows.map((row) => (
        <Fragment key={row.action}>
          <dt className="flex flex-wrap items-center gap-1 font-medium text-foreground">
            {row.keys?.map((combo, index) => (
              <Fragment key={combo.join("+")}>
                {index > 0 ? <span className="text-muted-foreground">/</span> : null}
                <span className="inline-flex items-center gap-0.5">
                  {combo.map((key) => <Kbd key={key}>{key}</Kbd>)}
                </span>
              </Fragment>
            ))}
            {row.gesture ? <span>{row.gesture}</span> : null}
          </dt>
          <dd className="leading-snug text-muted-foreground">{row.action}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * What you can do on the Custom canvas: shown in the Selected block while nothing is selected,
 * under a foldable "Shortcuts" row (open until folded) at the end of the Custom fields otherwise. Keyboard and mouse on devices
 * with a fine pointer; touch gestures on phones and tablets.
 */
export function CustomShortcuts() {
  const { mod, shift, alt } = useShortcutKeys();
  const keyboard: Row[] = [
    { gesture: "Drag", action: "Move. Snaps to the margins, centre, safe lines and other pieces" },
    { gesture: "Green handle", action: "Drag to resize. Icon tiles stay square; text, footer and follow panel change width" },
    { keys: [[alt]], gesture: "+ drag", action: "Move or resize freely, without snapping" },
    { keys: [["↑", "↓", "←", "→"]], action: `Nudge the selected piece (${shift} for bigger steps)` },
    { keys: [["Delete"]], action: "Remove the selected piece" },
    { keys: [[mod, "D"]], action: "Duplicate the selected piece" },
    { keys: [[mod, "Z"], [shift, mod, "Z"]], action: `Undo / redo (${mod} Y also redoes)` },
    { keys: [["Esc"]], action: "Deselect (or click empty space)" },
    { gesture: "Double-click text", action: "Edit it in this panel" },
    { gesture: "Drop a photo", action: "Fills the selected photo, else an empty photo background, else adds one" }
  ];
  const touch: Row[] = [
    { gesture: "Tap a piece", action: "Select it and edit it here" },
    { gesture: "Drag", action: "Move. Snaps to the margins, centre and safe lines" },
    { gesture: "Green handle", action: "Drag to resize" },
    { gesture: "Tap empty space", action: "Deselect" }
  ];
  return (
    <>
      <ShortcutRows rows={keyboard} label="Mouse and keyboard" className="pointer-coarse:hidden" />
      <ShortcutRows rows={touch} label="Touch" className="hidden pointer-coarse:grid" />
    </>
  );
}
