"use client";

import { useEffect, useState } from "react";
import { BellRing, Download, HardDrive, Laptop, PanelsTopLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { MAC_APP_DOWNLOAD_URL, macAppAudience, type MacAppAudience } from "@/src/lib/mac-app-bridge";

const BENEFITS = [
  { Icon: BellRing, title: "Mac notifications", text: "A notification the moment Portal emails you: approvals, comments, grades, uploads." },
  { Icon: PanelsTopLeft, title: "Portal in its own window", text: "Fast, with tabs, right from your Dock. No browser tab to lose." },
  { Icon: HardDrive, title: "Drive in Finder", text: "InFocus Drive shows up like a normal disk. Drag footage in and out." }
];

const STEPS = [
  "Open the download. If your Mac asks, click Open.",
  "Click Move to Applications.",
  "Sign in with Google, then Allow notifications. It keeps itself updated after that."
];

/** Settings → InFocus for Mac: what the app does and a one-click download. */
export function MacAppCard() {
  const [audience, setAudience] = useState<MacAppAudience | null>(null);

  useEffect(() => {
    setAudience(macAppAudience(window.navigator.userAgent, window.navigator.maxTouchPoints));
  }, []);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <Laptop className="h-4 w-4" /> InFocus for Mac
      </p>
      <p className="text-sm text-muted-foreground">One app for Portal and Drive.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {BENEFITS.map(({ Icon, title, text }) => (
          <div key={title} className="rounded-lg border border-border bg-muted p-3">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Icon className="h-3.5 w-3.5 text-brand-green" /> {title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>

      {audience === "app" ? (
        <p className="text-xs text-muted-foreground">You&apos;re using InFocus for Mac. It updates itself.</p>
      ) : audience === "mac" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <a href={MAC_APP_DOWNLOAD_URL} className={buttonVariants({ size: "lg" })}>
              <Download className="mr-2 h-4 w-4" /> Download for Mac
            </a>
            <span className="text-xs text-muted-foreground">macOS 13 or later · Free</span>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : audience === "other" ? (
        <p className="text-xs text-muted-foreground">Available for Mac. Open Settings on a Mac to download it.</p>
      ) : null}
    </section>
  );
}
