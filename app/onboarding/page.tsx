"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";

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

type ChannelKey = "email" | "browser";
type CategoryKey = "announcements" | "comments" | "grades";

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

const categoryLabels: Record<CategoryKey, string> = {
  announcements: "Announcements",
  comments: "Comments",
  grades: "Grades"
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

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [googleName, setGoogleName] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [channels, setChannels] = useState<NotificationChannelState>(defaultChannels);
  const [notificationEmailInput, setNotificationEmailInput] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

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
        setGoogleName(data.name);
        setNickname(data.nickname ?? "");
        setChannels({
          ...defaultChannels,
          ...data.notifications
        });
        setNotificationEmailInput(data.notifications.notificationEmail ?? "");
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load onboarding.");
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
  }, [router]);

  const canSubmit = useMemo(() => {
    if (!nickname.trim()) {
      return false;
    }

    if (channels.emailEnabled && !notificationEmailInput.trim() && !email) {
      return false;
    }

    return true;
  }, [channels.emailEnabled, email, nickname, notificationEmailInput]);

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
    setError(null);

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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to complete onboarding.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
        <section className="w-full rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading onboarding...
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
      <section className="w-full rounded-2xl border border-border bg-card p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to InFocus Portal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a nickname and how you want to be notified. Google keeps your account name; this is only how you appear in InFocus.
        </p>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="nickname">
              Nickname
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none ring-ring transition focus:ring-2"
              placeholder="What should we call you?"
              maxLength={60}
            />
            {googleName ? (
              <p className="text-xs text-muted-foreground">Signed in with Google as {googleName}.</p>
            ) : null}
          </div>

          <section className="space-y-4 rounded-xl border border-border bg-muted/40 p-4">
            <h2 className="text-xs font-medium uppercase tracking-[0.11em] text-muted-foreground">Notification channels</h2>

            <div className="space-y-3 rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Email notifications</p>
                <Switch
                  checked={channels.emailEnabled}
                  onCheckedChange={(checked) => setChannels((current) => ({ ...current, emailEnabled: checked }))}
                />
              </div>
              <input
                value={notificationEmailInput}
                onChange={(event) => setNotificationEmailInput(event.target.value)}
                placeholder={email ?? "name@example.com"}
                disabled={!channels.emailEnabled}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                {(["announcements", "comments", "grades"] as const).map((category) => (
                  <label
                    key={`email-${category}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(channels[preferenceKeyMap.email[category]])}
                      onChange={(event) => updateCategoryPreference("email", category, event.target.checked)}
                      disabled={!channels.emailEnabled}
                    />
                    {categoryLabels[category]}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Browser notifications</p>
                <Switch
                  checked={channels.browserEnabled}
                  onCheckedChange={(checked) => setChannels((current) => ({ ...current, browserEnabled: checked }))}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["announcements", "comments", "grades"] as const).map((category) => (
                  <label
                    key={`browser-${category}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(channels[preferenceKeyMap.browser[category]])}
                      onChange={(event) => updateCategoryPreference("browser", category, event.target.checked)}
                      disabled={!channels.browserEnabled}
                    />
                    {categoryLabels[category]}
                  </label>
                ))}
              </div>
            </div>
          </section>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Finish onboarding"}
          </button>
        </form>
      </section>
    </main>
  );
}
