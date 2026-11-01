"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { needsThanksgivingWelcome } from "@/src/lib/thanksgiving";
import { LeafSprite, PieSprite, TurkeySprite } from "./sprites";

const WELCOMED_KEY = "infocus-thanksgiving-welcome";

const WHAT_HAPPENS = [
  ["Visitors drop by.", "Leaves fall, pies turn up at the edges and a turkey struts along the bottom. Catch the leaves and eat the pies; the Portal keeps count."],
  ["Watch for the big one.", "Every few minutes a wild turkey as tall as the window walks in, sizes you up and pecks holes in your screen."],
  ["You'll hear it.", "Rustles, gobbles and gusts of wind start after your first click."],
  ["Work still works.", "Everything stays clickable, and the big turkey stays away during videos, teleprompter run mode and dialogs."]
] as const;

function needsWelcome(): boolean {
  try {
    return needsThanksgivingWelcome(window.localStorage.getItem(WELCOMED_KEY), new Date());
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
 * The first time a browser opens the Portal each November: what the harvest theme does, a hint
 * that there are secrets to find, and where to turn things off (Settings → Appearance).
 */
export function ThanksgivingWelcome() {
  const [open, setOpen] = useState(needsWelcome);

  function close() {
    markWelcomed();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="max-w-md" hideClose>
        <div className="tg-welcome-art" aria-hidden>
          <LeafSprite variant={1} />
          <TurkeySprite />
          <PieSprite />
        </div>
        <DialogHeader>
          <DialogTitle className="text-xl">The Portal is stuffed</DialogTitle>
          <DialogDescription>Through November 30, InFocus Portal is dressed for the harvest.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {WHAT_HAPPENS.map(([title, detail]) => (
            <li key={title}>
              <span className="font-semibold text-foreground">{title}</span>{" "}
              <span className="text-muted-foreground">{detail}</span>
            </li>
          ))}
        </ul>
        <p className="tg-welcome-secret text-sm">
          Secrets are hidden all over the Portal. Try typing <kbd>g</kbd> <kbd>o</kbd> <kbd>b</kbd> <kbd>b</kbd> <kbd>l</kbd>{" "}
          <kbd>e</kbd> anywhere outside a text box. That&apos;s one. There are more, and not all of them are typed.
        </p>
        <p className="text-xs text-muted-foreground">
          Too much? Turn the colors, sounds or the giant turkey off in{" "}
          <Link href="/settings#appearance" className="underline underline-offset-2" onClick={close}>
            Settings → Appearance
          </Link>
          .
        </p>
        <DialogFooter>
          <Button onClick={close} className="w-full sm:w-auto">
            Pass the gravy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
