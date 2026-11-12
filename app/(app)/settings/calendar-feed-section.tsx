"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { InlineError } from "@/components/kit/alert";
import { Skeleton } from "@/components/kit/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { SettingsPanel, SettingsRow, SettingsSection } from "@/components/settings-layout";

type FeedLink = { httpsUrl: string; webcalUrl: string };

/** Settings → Calendar feed: the person's own .ics subscription link. */
export function CalendarFeedSection() {
  const [link, setLink] = useState<FeedLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/calendar/link", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message ?? "Couldn't load your calendar link.");
        if (!cancelled) setLink(payload.data as FeedLink);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Couldn't load your calendar link.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.webcalUrl);
      toast.success("Calendar link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }

  return (
    <SettingsSection
      id="calendar"
      title="Subscribe to my calendar"
      description="Your package deadlines (with approved extensions), anchor, PA and show-role days, and livestream sign-ups, in Apple Calendar, Google Calendar or Outlook. Calendar apps refresh it on their own schedule, usually every few hours."
    >
      <SettingsPanel>
        <SettingsRow
          title="Calendar link"
          description="Anyone with this link can see these dates, so keep it to yourself."
        >
          {link ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                Copy link
              </Button>
              <a href={link.webcalUrl} className={buttonVariants({ size: "sm" })}>
                Subscribe
              </a>
            </>
          ) : error ? null : (
            <Skeleton className="h-8 w-40" />
          )}
        </SettingsRow>
        {link ? (
          <div className="px-4 py-3 md:px-5">
            <input
              readOnly
              aria-label="Calendar link"
              value={link.webcalUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full truncate rounded-md border border-border bg-[var(--ink-2)] px-3 py-2 font-mono text-xs text-foreground"
            />
          </div>
        ) : null}
        {error ? (
          <div className="px-4 py-3 md:px-5">
            <InlineError>{error}</InlineError>
          </div>
        ) : null}
      </SettingsPanel>
    </SettingsSection>
  );
}
