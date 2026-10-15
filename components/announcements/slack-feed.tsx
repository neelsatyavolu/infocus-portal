import { ChevronRight, ExternalLink as ExternalLinkIcon, FileText } from "lucide-react";
import { SectionLabel } from "@/components/kit/section";
import { StatusTag } from "@/components/kit/status-tag";
import { NEW_POST_TAG_CLASS } from "@/components/announcements/announcements-seen";
import { buttonVariants } from "@/components/ui/button";
import { dateKeyInTimeZone } from "@/src/lib/announcement-submission";
import type { SlackAnnouncementItem } from "@/src/lib/slack-announcements";
import { cn } from "@/src/lib/utils";

/** One day of the feed, with an anchor id built from the Pacific date (unique across years). */
export type FeedDay = {
  id: string;
  label: string;
  shortLabel: string;
  monthLabel: string;
  items: SlackAnnouncementItem[];
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function keyFor(item: SlackAnnouncementItem | undefined) {
  if (!item) return null;
  const posted = new Date(item.postedAt);
  if (Number.isNaN(posted.getTime())) return null;
  const key = dateKeyInTimeZone(posted);
  return DATE_KEY.test(key) ? key : null;
}

const NEW_TAB = <span className="sr-only"> (opens in a new tab)</span>;

/** Adds ids, the year on older days ("Wednesday, October 15, 2025") and the rail's labels. */
export function buildFeedDays(groups: Array<{ dateLabel: string; items: SlackAnnouncementItem[] }>, now = new Date()): FeedDay[] {
  const thisYear = dateKeyInTimeZone(now).slice(0, 4);
  const used = new Set<string>();
  return groups.map((group, index) => {
    const key = keyFor(group.items[0]);
    const date = key ? dateFromKey(key) : null;
    let id = key ? `day-${key}` : `day-${index}`;
    if (used.has(id)) id = `${id}-${index}`;
    used.add(id);
    const year = key?.slice(0, 4);
    return {
      id,
      label: year && year !== thisYear ? `${group.dateLabel}, ${year}` : group.dateLabel,
      shortLabel: date
        ? `${date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${date.getUTCDate()}`
        : group.dateLabel,
      monthLabel: date ? date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "Earlier",
      items: group.items
    };
  });
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "IF"
  );
}

function AuthorAvatar({ item }: { item: SlackAnnouncementItem }) {
  const size = "h-8 w-8 sm:h-9 sm:w-9";
  return (
    // Same height as the name line, so the avatar centres on it.
    <div className="flex min-h-8 items-center sm:min-h-9 pointer-coarse:min-h-10">
      {item.authorImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.authorImageUrl}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
          className={cn(size, "shrink-0 rounded-full object-cover")}
        />
      ) : (
        <div className={cn(size, "grid shrink-0 place-items-center rounded-full av-gray text-[11px] font-bold")}>
          {initials(item.authorName)}
        </div>
      )}
    </div>
  );
}

function AnnouncementBody({ item }: { item: SlackAnnouncementItem }) {
  const parts =
    item.parts.length > 0 ? item.parts : item.text ? [{ type: "text" as const, value: item.text }] : [];
  if (parts.length === 0 && item.attachments.length === 0) return null;
  return (
    <div className="mt-1 max-w-[72ch] space-y-3">
      {parts.length > 0 ? (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-pretty text-foreground">
          {parts.map((part, index) =>
            part.type === "link" ? (
              <a
                key={`${part.href}-${index}`}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[var(--brand-green)] underline decoration-[var(--brand-green)]/40 underline-offset-2 hover:decoration-[var(--brand-green)]"
              >
                {part.label}
                {NEW_TAB}
              </a>
            ) : (
              <span key={index}>{part.value}</span>
            )
          )}
        </p>
      ) : null}
      {item.attachments.length > 0 ? (
        <ul className="space-y-2">
          {item.attachments.map((file) => (
            <li key={file.id}>
              <a
                href={`/api/slack/files/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 min-w-0 items-center gap-3 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{file.title}</span>
                {file.prettyType ? <StatusTag size="sm">{file.prettyType}</StatusTag> : null}
                {NEW_TAB}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One post: avatar, then a name line (name, time, New, Open in Slack) over the body. Everything on
 * the name line sits together after the name, so nothing floats at the card's far edge on wide
 * screens.
 */
function SlackPost({ item }: { item: SlackAnnouncementItem }) {
  return (
    <article
      data-post-ts={item.ts}
      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 p-4 sm:grid-cols-[2.25rem_minmax(0,1fr)] md:p-5"
    >
      <AuthorAvatar item={item} />
      <div className="min-w-0">
        <div className="flex min-h-8 min-w-0 items-center gap-2 sm:min-h-9 pointer-coarse:min-h-10">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">{item.authorName}</span>
          <time
            dateTime={item.postedAt}
            className="shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground"
          >
            {item.timeLabel}
          </time>
          <span className={cn("hidden shrink-0", NEW_POST_TAG_CLASS)}>
            <StatusTag tone="success" size="sm">
              New
            </StatusTag>
          </span>
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in Slack (opens in a new tab)"
            title="Open in Slack"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "-ml-1 shrink-0 text-muted-foreground pointer-coarse:h-10 pointer-coarse:w-10"
            )}
          >
            <ExternalLinkIcon aria-hidden />
          </a>
        </div>
        <AnnouncementBody item={item} />
      </div>
    </article>
  );
}

/** The feed: a label row per day (day, rule, post count) over one card of post rows. */
export function SlackFeed({ days }: { days: FeedDay[] }) {
  return (
    <div className="min-w-0 space-y-6">
      {days.map((day) => (
        <section
          key={day.id}
          id={day.id}
          aria-labelledby={`${day.id}-title`}
          // Off-screen days skip layout and paint until scrolled near (the feed can hold months).
          className="scroll-mt-[calc(var(--app-header-h,0px)+1rem)] space-y-2 [contain-intrinsic-size:auto_24rem] [content-visibility:auto]"
        >
          <SectionLabel
            as="h2"
            id={`${day.id}-title`}
            rule
            end={
              <span className="font-mono-broadcast text-[11px] tabular-nums">
                {day.items.length} {day.items.length === 1 ? "post" : "posts"}
              </span>
            }
          >
            {day.label}
          </SectionLabel>
          <ol className="divide-y divide-border rounded-md border border-border bg-card">
            {day.items.map((item) => (
              <li key={item.id}>
                <SlackPost item={item} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Consecutive days of the same month, with the month's post total (the rail's folders). */
export function groupFeedDaysByMonth(days: FeedDay[]) {
  const months: Array<{ label: string; posts: number; days: FeedDay[] }> = [];
  for (const day of days) {
    const last = months[months.length - 1];
    if (last && last.label === day.monthLabel) {
      months[months.length - 1] = { ...last, posts: last.posts + day.items.length, days: [...last.days, day] };
    } else {
      months.push({ label: day.monthLabel, posts: day.items.length, days: [day] });
    }
  }
  return months;
}

/** Desktop rail: every day, grouped by month (newest month open), each a jump link. */
export function SlackDayIndex({ days }: { days: FeedDay[] }) {
  const months = groupFeedDaysByMonth(days);
  return (
    <nav
      aria-labelledby="feed-days-title"
      className="flex max-h-[calc(100dvh-var(--app-header-h,0px)-2rem)] min-w-0 flex-col rounded-md border border-border bg-card"
    >
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <h2 id="feed-days-title" className="text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
          Days
        </h2>
        <span className="font-mono-broadcast text-[13px] tabular-nums text-muted-foreground">{days.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {months.map((month, index) => (
          <details key={`${month.label}-${index}`} open={index === 0} className="group">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-4 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
              <span className="min-w-0 flex-1 truncate">{month.label}</span>
              <span className="font-mono-broadcast tabular-nums">{month.posts}</span>
            </summary>
            <ul className="pb-1">
              {month.days.map((day) => (
                <li key={day.id}>
                  <a
                    href={`#${day.id}`}
                    className="flex h-8 items-center gap-2 pl-9 pr-4 text-[13px] text-[var(--ink-text)] transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 truncate">{day.shortLabel}</span>
                    <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{day.items.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </nav>
  );
}
