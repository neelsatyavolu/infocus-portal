import { History } from "lucide-react";
import { Avatar } from "@/components/kit/avatar";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel, type PanelPadding } from "@/components/kit/panel";
import { formatRelativeTime, type DashboardActivityEntry } from "@/src/server/dashboard-data";

/**
 * The viewer's own recent actions (up to 6). Every entry is theirs, so their initials show once
 * beside the title (one neutral tone) instead of on every row. Rows read "You uploaded
 * **Interview v2**" with the time in a fixed right column; they wrap to two lines where the
 * panel is narrow (phones, the producer rail) and stay on one line when it's wide. When there
 * is nothing yet, the panel holds the kit's empty state, centred in whatever height the grid
 * row gives it. `padding` matches the cards beside it (the producer rail uses `md`).
 */
export function ActivityPanel({
  activity,
  padding = "lg",
  className
}: {
  activity: DashboardActivityEntry[];
  padding?: PanelPadding;
  className?: string;
}) {
  const initials = activity[0]?.initials;

  return (
    <Panel
      id="home-activity"
      title={
        <span className="flex min-w-0 items-center gap-2">
          {initials ? (
            <span aria-hidden className="flex">
              <Avatar initials={initials} size={24} />
            </span>
          ) : null}
          Your activity
        </span>
      }
      titleAs="h2"
      padding={padding}
      className={className}
      bodyClassName="flex flex-col"
    >
      {activity.length > 0 ? (
        <ul aria-label="Recent activity" className="@container">
          {activity.map((entry) => {
            const subject = entry.subject ?? "an item";
            const time = formatRelativeTime(entry.createdAt);
            return (
              <li
                key={entry.id}
                title={`You ${entry.verb} ${subject}`}
                className="flex min-h-10 items-center gap-3 border-t border-border py-2 text-sm first:border-t-0"
              >
                <span className="line-clamp-2 min-w-0 flex-1 text-muted-foreground @md:line-clamp-1">
                  <span className="font-semibold text-foreground">You</span> {entry.verb}{" "}
                  <strong className="font-semibold text-foreground">{subject}</strong>
                </span>
                <time
                  dateTime={entry.createdAt}
                  className="w-20 shrink-0 text-right font-mono-broadcast text-xs tabular-nums text-muted-foreground"
                >
                  {time}
                </time>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={History} title="No recent activity from you yet." className="flex-1 justify-center" />
      )}
    </Panel>
  );
}
