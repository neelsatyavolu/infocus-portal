"use client";

import { useSyncExternalStore } from "react";
import { BellRing, Download, HardDrive, PanelsTopLeft } from "lucide-react";
import { Skeleton } from "@/components/kit/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { SettingsPanel, SettingsSection } from "@/components/settings-layout";
import { MAC_APP_DOWNLOAD_URL, macAppAudience, type MacAppAudience } from "@/src/lib/mac-app-bridge";

const BENEFITS = [
  { Icon: BellRing, title: "Mac notifications", text: "A notification the moment Portal emails you: approvals, comments, grades, uploads." },
  { Icon: PanelsTopLeft, title: "Portal in its own window", text: "Fast, with tabs, right from your Dock. No browser tab to lose." },
  { Icon: HardDrive, title: "Drive in Finder", text: "InFocus Drive shows up like a normal disk. Drag footage in and out." }
];

/** The benefits as one muted line, for devices that can't install the app. */
const BENEFITS_LINE = BENEFITS.map(({ title }) => title).join(" · ");

const STEPS = [
  "Open the download. If your Mac asks, click Open.",
  "Click Move to Applications.",
  "Click Allow when it asks about notifications, then sign in with Google. It keeps itself updated after that."
];

function noopSubscribe() {
  return () => undefined;
}

/** Who is looking: null during the server render and hydration, so nothing is guessed. */
function useMacAudience(): MacAppAudience | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => macAppAudience(window.navigator.userAgent, window.navigator.maxTouchPoints),
    () => null
  );
}

/** The three things the app does, shown only on a Mac browser, where it can be installed. */
function Benefits() {
  return (
    <ul className="grid gap-x-8 gap-y-4 px-4 py-4 md:px-5 @2xl:grid-cols-3">
      {BENEFITS.map(({ Icon, title, text }) => (
        <li key={title} className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon className="h-4 w-4 shrink-0 text-brand-green" aria-hidden="true" /> {title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{text}</p>
        </li>
      ))}
    </ul>
  );
}

const FOOTER_CLASS = "px-4 py-3 md:px-5";

/** On a Mac: the install steps on the left, Download for Mac on the right. */
function DownloadFooter() {
  return (
    <div className={`${FOOTER_CLASS} flex flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-8`}>
      <ol className="min-w-0 space-y-1">
        {STEPS.map((step, index) => (
          <li key={step} className="flex min-w-0 gap-2 text-[13px] leading-snug text-muted-foreground">
            <span className="w-3 shrink-0 font-medium tabular-nums" aria-hidden="true">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="sr-only">Step {index + 1}: </span>
              {step}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex shrink-0 flex-col items-start gap-1.5 @2xl:items-end">
        <a href={MAC_APP_DOWNLOAD_URL} className={buttonVariants({ variant: "outline" })}>
          <Download /> Download for Mac
        </a>
        <span className="text-xs text-muted-foreground">macOS 13 or later · Free</span>
      </div>
    </div>
  );
}

/** One row for people who can't (or needn't) download here, with an optional muted line under it. */
function NoteRow({ title, text, detail }: { title: string; text: string; detail?: string }) {
  return (
    <div className={`${FOOTER_CLASS} flex min-h-15 flex-col justify-center gap-0.5 text-[13px] leading-snug`}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground">{text}</span>
      </p>
      {detail ? <p className="text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/**
 * Settings → InFocus for Mac, shaped by audience: on a Mac browser, the benefits plus the download
 * and steps; inside the app, one row; on other devices, one row plus a muted line of what it does.
 */
export function MacAppSection() {
  const audience = useMacAudience();

  return (
    <SettingsSection id="mac-app" title="InFocus for Mac" description="One app for Portal and Drive.">
      <SettingsPanel>
        {audience === "mac" ? (
          <>
            <Benefits />
            <DownloadFooter />
          </>
        ) : audience === "app" ? (
          <NoteRow title="You're using InFocus for Mac." text="It updates itself." />
        ) : audience === "other" ? (
          <NoteRow title="Available for Mac." text="Open Settings on a Mac to download it." detail={BENEFITS_LINE} />
        ) : (
          <div className={`${FOOTER_CLASS} flex min-h-15 items-center`}>
            <Skeleton className="h-9 w-48 rounded-md" />
          </div>
        )}
      </SettingsPanel>
    </SettingsSection>
  );
}
