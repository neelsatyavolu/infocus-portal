"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { SectionHeader } from "@/components/kit/section";
import { PageHeader } from "@/components/page-header";
import { ENTRY_CONTROL, ENTRY_QUIET_CONTROL } from "@/components/public-entry/entry-panel";
import { PublicFrame } from "@/components/public-entry/public-frame";
import { SettingsPanel, SettingsRow } from "@/components/settings-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/lib/utils";
import { ChannelCard, ChannelGrid, type CategoryKey, type ChannelKey } from "./channel-cards";
import { OnboardingSkeleton } from "./onboarding-skeleton";

type NotificationChannelState = {
  emailEnabled: boolean;
  notificationEmail: string | null;
  browserEnabled: boolean;
  emailAnnouncementsEnabled: boolean;
  emailCommentsEnabled: boolean;
  emailGradesEnabled: boolean;
  browserAnnouncementsEnabled: boolean;
  browserCommentsEnabled: boolean;
  browserGradesEnabled: boolean;
};

type OnboardingPayload = {
  email: string | null;
  name: string | null;
  nickname: string;
  onboardingCompleted: boolean;
  notifications: NotificationChannelState;
};

const defaultChannels: NotificationChannelState = {
  emailEnabled: true,
  notificationEmail: null,
  browserEnabled: false,
  emailAnnouncementsEnabled: true,
  emailCommentsEnabled: true,
  emailGradesEnabled: false,
  browserAnnouncementsEnabled: true,
  browserCommentsEnabled: true,
  browserGradesEnabled: false
};

const preferenceKeyMap: Record<ChannelKey, Record<CategoryKey, keyof NotificationChannelState>> = {
  email: {
    announcements: "emailAnnouncementsEnabled",
    comments: "emailCommentsEnabled",
    grades: "emailGradesEnabled"
  },
  browser: {
    announcements: "browserAnnouncementsEnabled",
    comments: "browserCommentsEnabled",
    grades: "browserGradesEnabled"
  }
};

const CHANNEL_KEYS = Object.keys(defaultChannels) as (keyof NotificationChannelState)[];

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [channels, setChannels] = useState<NotificationChannelState>(defaultChannels);
  const [notificationEmailInput, setNotificationEmailInput] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch("/api/onboarding", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "Failed to load onboarding.");
        }

        if (!active) {
          return;
        }

        const data = payload.data as OnboardingPayload;

        if (data.onboardingCompleted) {
          router.replace("/dashboard");
          return;
        }

        setEmail(data.email);
        setAccountName(data.name);
        setNickname(data.nickname ?? "");
        setChannels({
          ...defaultChannels,
          ...data.notifications
        });
        setNotificationEmailInput(data.notifications.notificationEmail ?? "");
      } catch (error) {
        if (!active) {
          return;
        }
        // The form stays usable with defaults: (app)/layout keeps sending people here until they finish.
        setLoadError(error instanceof Error ? error.message : "Failed to load onboarding.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router, loadAttempt]);

  const submitHint = useMemo(() => {
    if (!nickname.trim()) {
      return "Add a nickname to continue.";
    }

    if (channels.emailEnabled && !notificationEmailInput.trim() && !email) {
      return "Add an email address for notifications.";
    }

    return null;
  }, [channels.emailEnabled, email, nickname, notificationEmailInput]);
  const canSubmit = submitHint === null;
  // After a failed load the form starts from the defaults. Try again is offered only until the
  // person changes something, so a reload never overwrites choices they already made.
  const untouched =
    !nickname && !notificationEmailInput && CHANNEL_KEYS.every((key) => channels[key] === defaultChannels[key]);

  function isOn(channel: ChannelKey) {
    return (category: CategoryKey) => Boolean(channels[preferenceKeyMap[channel][category]]);
  }

  function updateCategoryPreference(channel: ChannelKey, category: CategoryKey, checked: boolean) {
    const key = preferenceKeyMap[channel][category];
    setChannels((current) => ({
      ...current,
      [key]: checked
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setSaving(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nickname: nickname.trim(),
          notifications: {
            ...channels,
            notificationEmail: notificationEmailInput.trim() || null
          }
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "Failed to complete onboarding.");
      }

      router.replace("/dashboard");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to complete onboarding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PublicFrame width="reading" aside={email ? <span className="max-sm:hidden">Signed in as {email}</span> : undefined}>
      <PageHeader
        eyebrow="First sign-in"
        title="Welcome to InFocus Portal"
        description="Choose a nickname and how you want to be notified. You can change both later in Settings."
      />

      {loading ? (
        <OnboardingSkeleton />
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          {loadError ? (
            <Alert
              tone="danger"
              className="md:px-6"
              title={loadError}
              action={
                untouched ? (
                  // A box-less wrapper, so the alert's 32px action row doesn't shrink the 40px touch target.
                  <span className="contents">
                    <Button type="button" variant="outline" className={ENTRY_QUIET_CONTROL} onClick={() => setLoadAttempt((n) => n + 1)}>
                      <RotateCw aria-hidden />
                      Try again
                    </Button>
                  </span>
                ) : undefined
              }
            >
              {untouched
                ? "Try again to load your saved choices, or finish with the choices below."
                : "You can still finish with the choices below."}
            </Alert>
          ) : null}

          <section aria-labelledby="onboarding-profile" className="space-y-3">
            <SectionHeader id="onboarding-profile" title="Profile" />
            <SettingsPanel>
              <SettingsRow
                title="Nickname"
                htmlFor="nickname"
                className="md:px-6"
                description={
                  accountName
                    ? `How you appear in InFocus. Your account name (${accountName}) stays the same.`
                    : "How you appear in InFocus. Your account name stays the same."
                }
              >
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="What should we call you?"
                  maxLength={60}
                  className={cn(ENTRY_CONTROL, "sm:w-64")}
                />
              </SettingsRow>
            </SettingsPanel>
          </section>

          <section aria-labelledby="onboarding-notifications" className="space-y-3">
            <SectionHeader id="onboarding-notifications" title="Notifications" />
            <ChannelGrid>
              <ChannelCard
                channel="email"
                enabled={channels.emailEnabled}
                onEnabledChange={(checked) => setChannels((current) => ({ ...current, emailEnabled: checked }))}
                isOn={isOn("email")}
                onCategoryChange={(category, checked) => updateCategoryPreference("email", category, checked)}
              >
                <div className="space-y-1.5">
                  <label htmlFor="notification-email" className="block text-sm font-medium text-foreground">
                    Send to
                  </label>
                  <Input
                    id="notification-email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={notificationEmailInput}
                    onChange={(event) => setNotificationEmailInput(event.target.value)}
                    placeholder={email ?? "name@example.com"}
                    disabled={!channels.emailEnabled}
                    aria-describedby="notification-email-hint"
                    className={cn(ENTRY_CONTROL, "w-full")}
                  />
                  <p id="notification-email-hint" className="break-words text-[13px] leading-snug text-muted-foreground">
                    Optional. Leave blank to use {email ?? "your account email"}.
                  </p>
                </div>
              </ChannelCard>
              <ChannelCard
                channel="browser"
                enabled={channels.browserEnabled}
                onEnabledChange={(checked) => setChannels((current) => ({ ...current, browserEnabled: checked }))}
                isOn={isOn("browser")}
                onCategoryChange={(category, checked) => updateCategoryPreference("browser", category, checked)}
              >
                <div className="space-y-1.5">
                  <p className="text-sm leading-snug text-[var(--ink-text)]">Pop-up notifications on the devices you use.</p>
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    This saves your choice. Turn it on for each device in Settings after you finish.
                  </p>
                </div>
              </ChannelCard>
            </ChannelGrid>
          </section>

          {submitError ? <Alert tone="danger" className="md:px-6">{submitError}</Alert> : null}

          {/* Sticky (not fixed) on phones so the keyboard never covers a field; inline from md. */}
          <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:static md:mx-0 md:border-t-0 md:bg-transparent md:p-0">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-4">
              {submitHint ? <p className="min-w-0 text-[13px] text-muted-foreground md:mr-auto">{submitHint}</p> : null}
              <Button type="submit" disabled={!canSubmit || saving} className={cn(ENTRY_CONTROL, "w-full md:w-auto")}>
                {saving ? "Saving…" : "Finish onboarding"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </PublicFrame>
  );
}
