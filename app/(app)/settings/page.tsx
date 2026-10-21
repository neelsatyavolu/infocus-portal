"use client";

import { AlertTriangle } from "lucide-react";
import { SettingsHeader, SettingsLayout, type SettingsNavItem } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";
import { PinsSection, useAccessPin } from "./access-pins";
import { AboutSection } from "./about-section";
import { AppearanceSection } from "./appearance-card";
import { AppsSection } from "./apps-section";
import { MacAppSection } from "./mac-app-card";
import { useAppNotifications } from "./mac-notifications-card";
import { NotificationsSection } from "./notifications-section";
import { ProfileSection, useProfile } from "./profile-section";
import { settingsAttention, settingsNavStatuses, type AttentionItem, type SettingsStatusInput } from "./settings-status";
import { SignatureSection, useSignature } from "./signature-section";
import { useGatedHashScroll } from "./use-gated-hash-scroll";
import { useNotifications } from "./use-notifications";

const SAVE_NOTE = "Most changes save as soon as you make them.";

/**
 * Where a section's title lands after a rail, strip or #hash jump. SettingsSection (shared with
 * Admin) has a fixed scroll-mt-24, which is wrong both ways here: on phones the section strip is
 * sticky under the top bar, and the top bar grows with the safe-area inset (notched iPhones, the
 * iPhone app), so titles slid under the strip; on wide screens the scroller's own 64px scroll
 * padding already clears the top bar, so titles landed 160px down, below the rail's 120px
 * active line. Phones: top bar + strip + a little air. Wide: 24px under the top bar.
 */
const SECTION_LANDING =
  "[&_section]:scroll-mt-[calc(var(--app-header-h,0px)+3.5rem)] lg:[&_section]:scroll-mt-6";

/**
 * The header's one line: how saving works. On phones, where the section strip can hide a flagged
 * item off-screen, it lists what needs a look instead, as links. On wide screens the rail is always
 * in view with its tags, so the line stays the save note there.
 */
function HeaderContext({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return <>{SAVE_NOTE}</>;
  const danger = items.some((item) => item.tone === "danger");
  return (
    <>
      <span className="hidden lg:inline">{SAVE_NOTE}</span>
      <span className="flex flex-wrap items-center gap-x-2 lg:hidden">
        <AlertTriangle
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0", danger ? "text-danger" : "text-[var(--brand-amber)]")}
        />
        {items.map((item, index) => (
          <span key={item.text} className="inline-flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
            ) : null}
            <a
              href={`#${item.id}`}
              className="inline-flex min-h-8 items-center text-foreground underline decoration-muted-foreground underline-offset-4 hover:decoration-current"
            >
              {item.text}
            </a>
          </span>
        ))}
      </span>
    </>
  );
}

export default function SettingsPage() {
  const profile = useProfile();
  const notifications = useNotifications();
  const classBoardPin = useAccessPin(
    "/api/class-board/pin",
    "Replace the current Class Board PIN? Devices using the old one will need the new PIN."
  );
  const livestreamPin = useAccessPin(
    "/api/livestreams/pin",
    "Replace the livestream dashboard PIN? Anyone using the old one will need the new PIN."
  );
  const signature = useSignature();
  const app = useAppNotifications(notifications.appDevice);

  const showPins = classBoardPin.visible || livestreamPin.visible;
  useGatedHashScroll({ pins: showPins, signature: signature.visible });

  const visiblePins = [classBoardPin, livestreamPin].filter((pin) => pin.visible);
  const statusInput: SettingsStatusInput = {
    notifications: {
      // Real preferences only: after a failed first load there are none, only defaults.
      loaded: notifications.loaded && notifications.appDevice !== undefined,
      error: Boolean(notifications.error),
      emailEnabled: notifications.channels.emailEnabled,
      browserEnabled: notifications.channels.browserEnabled,
      inApp: Boolean(notifications.appDevice)
    },
    browserDevice: notifications.appDevice === null ? notifications.browserDevice : null,
    app: app.device ? { device: app.device === "mac" ? "Mac app" : "iPhone app", tag: app.tag, error: Boolean(app.error) } : null,
    profileError: Boolean(profile.error),
    pins: {
      visible: showPins,
      anyNotSet: visiblePins.some((pin) => pin.loaded && !pin.pin),
      error: visiblePins.some((pin) => Boolean(pin.error))
    },
    signature: { visible: signature.visible, hasSignature: Boolean(signature.signature), error: Boolean(signature.error) }
  };
  const statuses = settingsNavStatuses(statusInput);

  // Always-visible sections first. PINs and Signature appear after their GET (at once on a return
  // visit, from client-cache), so on a first visit they can push Mac and Apps down; a #pins or
  // #signature link still lands (useGatedHashScroll).
  const nav: SettingsNavItem[] = [
    { id: "notifications", label: "Notifications", status: statuses.notifications },
    { id: "appearance", label: "Appearance & playback" },
    { id: "profile", label: "Profile", status: statuses.profile },
    ...(showPins ? [{ id: "pins", label: "PINs", status: statuses.pins }] : []),
    ...(signature.visible ? [{ id: "signature", label: "Signature", status: statuses.signature }] : []),
    { id: "mac-app", label: "InFocus for Mac" },
    { id: "apps", label: "Apps & links" },
    { id: "about", label: "About" }
  ];

  return (
    <div className={SECTION_LANDING}>
      <SettingsLayout
        nav={nav}
        header={
          <SettingsHeader
            eyebrow="Account"
            title="Settings"
            description={<HeaderContext items={settingsAttention(statusInput)} />}
          />
        }
      >
        <NotificationsSection state={notifications} app={app} accountEmail={profile.profile?.email ?? null} />
        <AppearanceSection />
        <ProfileSection state={profile} />
        {showPins ? <PinsSection classBoard={classBoardPin} livestream={livestreamPin} /> : null}
        {signature.visible ? <SignatureSection state={signature} /> : null}
        <MacAppSection />
        <AppsSection />
        <AboutSection />
      </SettingsLayout>
    </div>
  );
}
