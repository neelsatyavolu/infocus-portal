import { ExternalLink, FileText, Megaphone } from "lucide-react";
import { requireUserId } from "@/src/lib/auth";
import { groupSlackAnnouncements, type SlackAnnouncementItem } from "@/src/lib/slack-announcements";
import { loadSlackAnnouncements } from "@/src/server/slack-announcements";

function AnnouncementBody({ item }: { item: SlackAnnouncementItem }) {
  const parts =
    item.parts.length > 0 ? item.parts : item.text ? [{ type: "text" as const, value: item.text }] : [];
  return (
    <>
      {parts.length > 0 ? (
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-pretty text-foreground">
          {parts.map((part, index) =>
            part.type === "link" ? (
              <a
                key={`${part.href}-${index}`}
                href={part.href}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[var(--brand-green)] underline decoration-[var(--brand-green)]/40 underline-offset-2 hover:decoration-[var(--brand-green)]"
              >
                {part.label}
              </a>
            ) : (
              <span key={index}>{part.value}</span>
            )
          )}
        </p>
      ) : null}
      {item.attachments.length > 0 ? (
        <div className="mt-3 space-y-2">
          {item.attachments.map((file) => (
            <a
              key={file.id}
              href={`/api/slack/files/${file.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground transition hover:bg-accent"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{file.title}</span>
              {file.prettyType ? (
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{file.prettyType}</span>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
    </>
  );
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

export default async function AnnouncementsPage() {
  await requireUserId();
  const { configured, items, error } = await loadSlackAnnouncements();
  const groups = groupSlackAnnouncements(items);

  return (
    <div className="route-enter mx-auto w-full max-w-3xl space-y-5 pb-24">
      <section className="brand-hero-panel relative overflow-hidden p-5 md:p-6">
        <div className="relative min-w-0">
          <div className="eyebrow flex items-center gap-2">
            <Megaphone className="h-3 w-3" />
            Slack
          </div>
          <h1 className="display-md mt-2 text-pretty text-foreground">Announcements</h1>
          <p className="mt-1 text-sm text-muted-foreground">Posts from #announcements.</p>
        </div>
      </section>

      {error ? (
        <article className="rounded-2xl border border-border bg-card p-5 text-sm text-amber-300">{error}</article>
      ) : !configured ? (
        <article className="rounded-2xl border border-dashed border-border bg-muted/50 p-6 text-sm text-muted-foreground">
          Slack announcements are not connected yet.
        </article>
      ) : groups.length === 0 ? (
        <article className="rounded-2xl border border-dashed border-border bg-muted/50 p-6 text-sm text-muted-foreground">
          No announcements yet.
        </article>
      ) : (
        groups.map((group) => (
          <section key={group.dateLabel} className="space-y-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.dateLabel}
            </h2>
            {group.items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  {item.authorImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.authorImageUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full av-gray text-[11px] font-bold">
                      {initials(item.authorName)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">{item.authorName}</p>
                      <div className="flex items-center gap-2">
                        <time dateTime={item.postedAt} className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">
                          {item.timeLabel}
                        </time>
                        <a
                          href={item.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Open in Slack"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                    <AnnouncementBody item={item} />
                  </div>
                </div>
              </article>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
