"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { needsChristmasWelcome } from "@/src/lib/christmas";
import { CocoaSprite, GiftSprite, GingerbreadSprite } from "./sprites";

const WELCOMED_KEY = "infocus-christmas-welcome";

const WHAT_HAPPENS = [
  ["The Portal is decorated.", "A garland of lights under the top bar, snow on the cards, and a little snowy village along the bottom of the window."],
  ["Visitors drop by.", "Presents float down, a gingerbread man runs along the bottom and cocoa turns up at the edges. Catch, chase and sip; the Portal keeps count, and your presents pile up under the tree."],
  ["Look up.", "Santa's sleigh flies over now and then. Wave at him. Shooting stars are rarer, and the middle bow on the garland does something."],
  ["Work still works.", "Everything stays clickable underneath. Sleigh bells start after your first click."]
] as const;

export function needsWelcome(): boolean {
  try {
    return needsChristmasWelcome(window.localStorage.getItem(WELCOMED_KEY), new Date());
  } catch {
    return false;
  }
}

function markWelcomed() {
  try {
    window.localStorage.setItem(WELCOMED_KEY, String(new Date().getFullYear()));
  } catch {
    // Storage blocked: needsWelcome() already says no, so nothing repeats.
  }
}

/**
 * The first time a browser opens the Portal each Christmas season (from Nov 29): what the Christmas theme does, a hint
 * that there are secrets to find, and where to turn things off (Settings → Appearance).
 */
export function ChristmasWelcome() {
  const [open, setOpen] = useState(needsWelcome);

  function close() {
    markWelcomed();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="max-w-md" hideClose>
        <div className="xm-welcome-art" aria-hidden>
          <GiftSprite variant={0} />
          <GingerbreadSprite />
          <CocoaSprite />
        </div>
        <DialogHeader>
          <DialogTitle className="text-xl">Merry Christmas from InFocus</DialogTitle>
          <DialogDescription>Through December 31, InFocus Portal is dressed for the holidays.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {WHAT_HAPPENS.map(([title, detail]) => (
            <li key={title}>
              <span className="font-semibold text-foreground">{title}</span>{" "}
              <span className="text-muted-foreground">{detail}</span>
            </li>
          ))}
        </ul>
        <p className="xm-welcome-secret text-sm">
          Secrets are hidden all over the Portal. Try typing <kbd>s</kbd> <kbd>n</kbd> <kbd>o</kbd> <kbd>w</kbd> anywhere outside a
          text box. That&apos;s one. There are more, and not all of them are typed.
        </p>
        <p className="text-xs text-muted-foreground">
          Too much? Turn the colors, snow or sounds off in{" "}
          <Link href="/settings#appearance" className="underline underline-offset-2" onClick={close}>
            Settings → Appearance
          </Link>
          .
        </p>
        <DialogFooter>
          <Button onClick={close} className="w-full sm:w-auto">
            Deck the halls
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
