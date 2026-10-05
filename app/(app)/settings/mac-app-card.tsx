"use client";

import { useEffect, useState } from "react";
import { BellRing, Download, HardDrive, PanelsTopLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SettingsPanel, SettingsPanelBody, SettingsRow } from "@/components/settings-layout";
import { MAC_APP_DOWNLOAD_URL, macAppAudience, type MacAppAudience } from "@/src/lib/mac-app-bridge";

const BENEFITS = [
  { Icon: BellRing, title: "Mac notifications", text: "A notification the moment Portal emails you: approvals, comments, grades, uploads." },
  { Icon: PanelsTopLeft, title: "Portal in its own window", text: "Fast, with tabs, right from your Dock. No browser tab to lose." },
  { Icon: HardDrive, title: "Drive in Finder", text: "InFocus Drive shows up like a normal disk. Drag footage in and out." }
];

const STEPS = [
  "Open the download. If your Mac asks, click Open.",
  "Click Move to Applications.",
  "Click Allow when it asks about notifications, then sign in with Google. It keeps itself updated after that."
];

/** Settings → InFocus for Mac: what the app does and a one-click download. */
export function MacAppPanel() {
  const [audience, setAudience] = useState<MacAppAudience | null>(null);

  useEffect(() => {
    setAudience(macAppAudience(window.navigator.userAgent, window.navigator.maxTouchPoints));
  }, []);

  return (
    <SettingsPanel>
      <SettingsPanelBody className="grid gap-5 sm:grid-cols-3">
        {BENEFITS.map(({ Icon, title, text }) => (
          <div key={title}>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon className="h-4 w-4 text-brand-green" aria-hidden="true" /> {title}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{text}</p>
          </div>
        ))}
      </SettingsPanelBody>

      {audience === "app" ? (
        <SettingsRow title="You're using InFocus for Mac" description="It updates itself." />
      ) : audience === "mac" ? (
        <SettingsRow
          title="Download"
          description={
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          }
        >
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <a href={MAC_APP_DOWNLOAD_URL} className={buttonVariants()}>
              <Download /> Download for Mac
            </a>
            <span className="text-xs text-muted-foreground">macOS 13 or later · Free</span>
          </div>
        </SettingsRow>
      ) : audience === "other" ? (
        <SettingsRow title="Available for Mac" description="Open Settings on a Mac to download it." />
      ) : null}
    </SettingsPanel>
  );
}
