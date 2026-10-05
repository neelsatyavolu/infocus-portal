"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  SaveStatus,
  SegmentedControl,
  SettingsHeader,
  SettingsLayout,
  SettingsNotice,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
  type SettingsNavItem
} from "@/components/settings-layout";
import { PinRow, useAccessPin } from "./access-pins";
import { ThemeRow } from "./appearance-card";
import { MacAppPanel } from "./mac-app-card";
import { NotificationsSection } from "./notifications-section";
import { SignatureSection, useSignature } from "./signature-section";

type PreferenceState = {
  autoPlay: boolean;
  soundEnabled: boolean;
  defaultView: "grid" | "list";
};

type Profile = { email: string | null; name: string | null; nickname: string | null };

const STORAGE_KEY = "infocus-settings";

const defaults: PreferenceState = {
  autoPlay: false,
  soundEnabled: true,
  defaultView: "grid"
};

const APP_LINKS = [
  {
    href: "https://grades.infocuspaly.com",
    title: "Grades dashboard",
    description: "Estimated grade, participation, packages, and calculator · grades.infocuspaly.com"
  },
  {
    href: "https://teleprompter.infocuspaly.com",
    title: "Teleprompter",
    description: "Fullscreen run mode + AI reformat · teleprompter.infocuspaly.com"
  },
  {
    href: "https://drive.infocuspaly.com",
    title: "InFocus Drive",
    description: "Media storage · drive.infocuspaly.com"
  }
];

export default function SettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<PreferenceState>(defaults);
  const [savedLabel, setSavedLabel] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedLabel, setProfileSavedLabel] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const classBoardPin = useAccessPin(
    "/api/class-board/pin",
    "Replace the current Class Board PIN? Devices using the old one will need the new PIN."
  );
  const livestreamPin = useAccessPin(
    "/api/livestreams/pin",
    "Replace the livestream dashboard PIN? Anyone using the old one will need the new PIN."
  );
  const signature = useSignature();

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);

      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const payload = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "Failed to load profile.");
        }

        const data = payload.data as Profile;
        setProfile(data);
        setNicknameInput(data.nickname ?? "");
      } catch (error) {
        if (!active) {
          return;
        }

        setProfileError(error instanceof Error ? error.message : "Failed to load profile.");
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PreferenceState;
      setPrefs({
        autoPlay: Boolean(parsed.autoPlay),
        soundEnabled: Boolean(parsed.soundEnabled),
        defaultView: parsed.defaultView === "list" ? "list" : "grid"
      });
    } catch {
      // ignore invalid local preferences
    }
  }, []);

  async function saveNickname(event: FormEvent) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nicknameInput.trim() || null })
      });
      const payload = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "Failed to save nickname.");
      }

      const data = payload.data as Profile;
      setProfile(data);
      setNicknameInput(data.nickname ?? "");
      setProfileSavedLabel("Saved");
      router.refresh();
      window.setTimeout(() => setProfileSavedLabel(""), 1200);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Failed to save nickname.");
    } finally {
      setProfileSaving(false);
    }
  }

  function save(next: PreferenceState) {
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private windows can block storage; the choice still applies for this visit.
    }
    setSavedLabel("Saved");
    window.setTimeout(() => setSavedLabel(""), 1200);
  }

  const nicknameUnchanged = nicknameInput.trim() === (profile?.nickname ?? "");
  const showPins = classBoardPin.visible || livestreamPin.visible;

  const nav: SettingsNavItem[] = [
    { id: "profile", label: "Profile" },
    ...(signature.visible ? [{ id: "signature", label: "Signature" }] : []),
    { id: "appearance", label: "Appearance" },
    { id: "playback", label: "Playback" },
    { id: "notifications", label: "Notifications" },
    ...(showPins ? [{ id: "pins", label: "PINs" }] : []),
    { id: "mac-app", label: "InFocus for Mac" },
    { id: "apps", label: "Apps & links" }
  ];

  return (
    <SettingsLayout
      nav={nav}
      header={
        <SettingsHeader
          eyebrow="Account"
          title="Settings"
          description="Your profile, how Portal looks, and how it reaches you."
        />
      }
    >
      <SettingsSection
        id="profile"
        title="Profile"
        description="How you appear to everyone in InFocus."
        actions={<SaveStatus text={profileLoading ? "Loading…" : profileSavedLabel} pending={profileLoading} />}
      >
        {profileError ? (
          <SettingsNotice tone="error" onDismiss={() => setProfileError(null)}>
            {profileError}
          </SettingsNotice>
        ) : null}
        <SettingsPanel>
          <SettingsRow
            title="Nickname"
            description="Shown on rosters, calendars, and comments. Signing in with Google won't overwrite it."
            htmlFor="nickname"
          >
            <form onSubmit={saveNickname} className="flex w-full gap-2 sm:w-auto">
              <Input
                id="nickname"
                value={nicknameInput}
                onChange={(event) => setNicknameInput(event.target.value)}
                placeholder="What should we call you?"
                maxLength={60}
                disabled={profileLoading || profileSaving}
                className="sm:w-64"
              />
              <Button type="submit" disabled={profileLoading || profileSaving || nicknameUnchanged}>
                {profileSaving ? "Saving…" : "Save"}
              </Button>
            </form>
          </SettingsRow>
          {profile?.name || profile?.email ? (
            <SettingsRow title="Google account" description={profile.name ?? undefined}>
              {profile.email ? (
                <span className="max-w-full truncate text-sm text-muted-foreground">{profile.email}</span>
              ) : null}
            </SettingsRow>
          ) : null}
        </SettingsPanel>
      </SettingsSection>

      {signature.visible ? <SignatureSection state={signature} /> : null}

      <SettingsSection id="appearance" title="Appearance">
        <SettingsPanel>
          <ThemeRow />
          <SettingsRow title="Default view">
            <SegmentedControl
              label="Default view"
              value={prefs.defaultView}
              options={[
                { value: "grid", label: "Grid", icon: <LayoutGrid /> },
                { value: "list", label: "List", icon: <List /> }
              ]}
              onChange={(defaultView) => save({ ...prefs, defaultView })}
            />
          </SettingsRow>
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection id="playback" title="Playback" actions={<SaveStatus text={savedLabel} />}>
        <SettingsPanel>
          <SettingsRow title="Autoplay videos on open" htmlFor="pref-autoplay">
            <Switch
              id="pref-autoplay"
              checked={prefs.autoPlay}
              onCheckedChange={(next) => save({ ...prefs, autoPlay: next })}
            />
          </SettingsRow>
          <SettingsRow title="Start with sound on" htmlFor="pref-sound">
            <Switch
              id="pref-sound"
              checked={prefs.soundEnabled}
              onCheckedChange={(next) => save({ ...prefs, soundEnabled: next })}
            />
          </SettingsRow>
        </SettingsPanel>
      </SettingsSection>

      <NotificationsSection accountEmail={profile?.email ?? null} />

      {showPins ? (
        <SettingsSection
          id="pins"
          title="PINs"
          description="Unlock one screen without signing in. A PIN never signs anyone into Portal."
        >
          <SettingsPanel>
            <PinRow title="Class Board PIN" description="Opens /class-board only." state={classBoardPin} />
            <PinRow
              title="Livestream dashboard PIN"
              description="Opens the livestream dashboard at /live until midnight."
              state={livestreamPin}
            />
          </SettingsPanel>
        </SettingsSection>
      ) : null}

      <SettingsSection id="mac-app" title="InFocus for Mac" description="One app for Portal and Drive.">
        <MacAppPanel />
      </SettingsSection>

      <SettingsSection id="apps" title="Apps & links">
        <SettingsPanel>
          {APP_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-secondary/60 md:px-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{link.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{link.description}</p>
              </div>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                aria-hidden="true"
              />
            </a>
          ))}
          <SettingsRow
            title="Weekly schedule"
            description="Mon PA · Tue/Thu class · Wed/Fri shows · holidays off (PAUSD calendar seeded)"
          />
        </SettingsPanel>
      </SettingsSection>
    </SettingsLayout>
  );
}
