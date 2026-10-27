"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GhostSprite, PumpkinSprite } from "./sprites";

const WELCOMED_KEY = "infocus-halloween-welcomed";

const WHAT_HAPPENS = [
  ["Visitors wander in.", "Pumpkins, candy, bats, a black cat, a witch and worse. Click them: smash pumpkins, catch candy."],
  ["Something will jump out.", "Every minute or so you'll get a BOO, and now and then the page itself does strange things for a few seconds."],
  ["You'll hear it.", "Spooky music and sounds start after your first click. The music has a mute button next to ✱."],
  ["Work still works.", "Everything stays clickable, and it all stays quiet during videos, teleprompter run mode, dialogs and typing."]
] as const;

/** Whether this browser still needs the welcome (never if storage is blocked, so it can't nag). */
function needsWelcome(): boolean {
  try {
    return window.localStorage.getItem(WELCOMED_KEY) === null;
  } catch {
    return false;
  }
}

function markWelcomed() {
  try {
    window.localStorage.setItem(WELCOMED_KEY, new Date().toISOString());
  } catch {
    // Storage blocked: needsWelcome() already says no, so nothing repeats.
  }
}

/**
 * The first time a browser opens the Portal in the Halloween season: what the haunting is, a hint
 * that there are secrets to find, and where to turn things off (Settings → Appearance). It has no
 * off switch of its own.
 */
export function HalloweenWelcome() {
  const [open, setOpen] = useState(needsWelcome);

  function close() {
    markWelcomed();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="hw-welcome max-w-md" hideClose>
        <div className="hw-welcome-art" aria-hidden>
          <PumpkinSprite face={2} />
          <GhostSprite />
          <PumpkinSprite face={0} />
        </div>
        <DialogHeader>
          <DialogTitle className="text-xl">The Portal is haunted</DialogTitle>
          <DialogDescription>
            From October 15 through November 1, InFocus Portal belongs to the things that go bump in the night.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {WHAT_HAPPENS.map(([title, detail]) => (
            <li key={title}>
              <span className="font-semibold text-foreground">{title}</span>{" "}
              <span className="text-muted-foreground">{detail}</span>
            </li>
          ))}
        </ul>
        <p className="hw-welcome-secret text-sm">
          Tricks are hidden all over the Portal. Try typing <kbd>b</kbd> <kbd>o</kbd> <kbd>o</kbd> anywhere outside a text
          box. That&apos;s one. There are more.
        </p>
        <p className="text-xs text-muted-foreground">
          Too much? Turn the colors, sounds, music, BOOs or hauntings off in{" "}
          <Link href="/settings#appearance" className="underline underline-offset-2" onClick={close}>
            Settings → Appearance
          </Link>
          .
        </p>
        <DialogFooter>
          <Button onClick={close} className="w-full sm:w-auto">
            Enter, if you dare
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
