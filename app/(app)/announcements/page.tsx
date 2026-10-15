import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { NewPostsMarker } from "@/components/announcements/new-posts-marker";
import { FEED_RAIL_GRID, FEED_RAIL_STICKY } from "@/components/announcements/sizes";
import { buildFeedDays, SlackDayIndex, SlackFeed } from "@/components/announcements/slack-feed";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/src/lib/auth";
import { groupSlackAnnouncements } from "@/src/lib/slack-announcements";
import { loadSlackAnnouncements } from "@/src/server/slack-announcements";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requireUserId();
  const { configured, items, error } = await loadSlackAnnouncements();
  const days = buildFeedDays(groupSlackAnnouncements(items));
  const postCount = items.length;

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Megaphone className="h-3 w-3" />
            Slack · #announcements
          </>
        }
        title="Announcements"
        description={
          postCount > 0 ? (
            <>
              Newest first · <span className="tabular-nums">{postCount}</span> {postCount === 1 ? "post" : "posts"}
            </>
          ) : (
            "Posts from the class Slack channel."
          )
        }
      />

      {/* On a Slack error the server still returns the last posts it had; they show below the alert. */}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {days.length > 0 ? (
        <div className={FEED_RAIL_GRID}>
          <SlackFeed days={days} />
          <aside className={`hidden lg:block ${FEED_RAIL_STICKY}`}>
            <SlackDayIndex days={days} />
          </aside>
          <NewPostsMarker newestTs={items[0]?.ts ?? null} />
        </div>
      ) : error ? null : (
        <div className="rounded-md border border-border bg-card">
          <EmptyState
            size="page"
            icon={Megaphone}
            title={configured ? "No announcements yet." : "Slack announcements are not connected yet."}
            description={configured ? "Posts in #announcements show up here." : undefined}
          />
        </div>
      )}
    </div>
  );
}
