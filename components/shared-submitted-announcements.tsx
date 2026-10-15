"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2Off, Megaphone } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { AnnouncementListSkeleton } from "@/components/public-entry/announcement-list-skeleton";
import { SubmittedAnnouncementList } from "@/components/submitted-announcement-list";
import type { SubmittedAnnouncement } from "@/components/submitted-announcement-card";

type ResponseShape = {
  announcements: SubmittedAnnouncement[];
};

/**
 * "link": the token is missing, invalid or expired (a 4xx), so only a new link helps.
 * "retry": the network, the server (5xx) or the rate limit (429), so trying again can work.
 */
type LoadFailure = { kind: "link" | "retry"; message: string };

const STATE_BOX_CLASS = "rounded-md border border-border bg-card";
const RETRY_MESSAGE = "Could not load the announcements. Check your connection and try again.";

/**
 * The body of the shared (read-only) announcements view. The page renders the frame and header,
 * so they paint at once; this part needs useSearchParams and sits under the page's Suspense.
 */
export function SharedSubmittedAnnouncements() {
  const token = useSearchParams().get("token") ?? "";
  const [announcements, setAnnouncements] = useState<SubmittedAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) {
        setFailure({ kind: "link", message: "This invite link is missing a token." });
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/announcements/submitted/shared?token=${encodeURIComponent(token)}`, {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => ({}))) as { data?: ResponseShape; error?: { message?: string } };
        if (!active) {
          return;
        }
        if (!response.ok || !payload.data) {
          const linkProblem = response.status >= 400 && response.status < 500 && response.status !== 429;
          setFailure({
            kind: linkProblem ? "link" : "retry",
            message: payload.error?.message ?? (linkProblem ? "Could not open this invite." : RETRY_MESSAGE)
          });
          return;
        }
        setAnnouncements(payload.data.announcements);
      } catch {
        if (active) {
          setFailure({ kind: "retry", message: RETRY_MESSAGE });
        }
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
  }, [token, attempt]);

  function retry() {
    setLoading(true);
    setFailure(null);
    setAttempt((count) => count + 1);
  }

  if (loading) {
    return <AnnouncementListSkeleton />;
  }

  if (failure?.kind === "retry") {
    return (
      <ErrorState
        size="page"
        title="Couldn’t load the announcements"
        message={failure.message}
        onRetry={retry}
        className={STATE_BOX_CLASS}
      />
    );
  }

  if (failure) {
    return (
      <EmptyState
        role="alert"
        size="page"
        icon={Link2Off}
        title="Can’t open this invite link"
        description={
          <>
            <p>{failure.message}</p>
            <p className="mt-1 text-muted-foreground">Ask the InFocus producer who sent it for a new link.</p>
          </>
        }
        className={STATE_BOX_CLASS}
      />
    );
  }

  return (
    <SubmittedAnnouncementList
      announcements={announcements}
      hideEmail
      hideEnded
      empty={
        <EmptyState
          size="page"
          icon={Megaphone}
          title="No current announcements"
          description="New requests show here once they’re submitted."
          className={STATE_BOX_CLASS}
        />
      }
    />
  );
}
