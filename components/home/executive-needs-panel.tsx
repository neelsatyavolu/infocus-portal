import {
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  ListVideo,
  Megaphone,
  Mic,
  Radio,
  UserPlus,
  Users,
  type LucideIcon
} from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { ListRow } from "@/components/kit/list-row";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { needDetail, needUrgency, type NeedItem, type NeedKind } from "@/components/home/executive-needs";
import type { ExecutivePart } from "@/src/server/executive-dashboard";

const KIND_ICON: Record<NeedKind, LucideIcon> = {
  group: Users,
  extensions: CalendarClock,
  participation: ClipboardCheck,
  access: UserPlus,
  livestreams: Radio,
  anchors: Mic,
  announcers: Megaphone,
  queue: ListVideo
};

/** The parts that feed this list, named the way the error line says them. */
const PART_LABEL: Partial<Record<ExecutivePart, string>> = {
  groups: "groups",
  extensions: "extension requests",
  participation: "participation changes",
  access: "access requests",
  livestreams: "livestream sign-ups",
  calendar: "the calendar"
};

function joinWords(words: string[]) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * Everything waiting on the viewer, most urgent first (orderNeeds). Each row is one link: an
 * icon, what it is, one line on what's needed, and the urgency tag on the right of line 1.
 */
export function ExecutiveNeedsPanel({
  needs,
  failed,
  now,
  className
}: {
  needs: NeedItem[];
  failed: ExecutivePart[];
  now: Date;
  className?: string;
}) {
  const missing = joinWords(failed.flatMap((part) => (PART_LABEL[part] ? [PART_LABEL[part]] : [])));

  return (
    <Panel id="home-needs" title="Needs you" titleAs="h2" count={needs.length} padding="none" className={className}>
      {missing ? <InlineError className="px-4 pt-3 md:px-5">{`Couldn't load ${missing}. Reload the page to try again.`}</InlineError> : null}
      {needs.length > 0 ? (
        <ul aria-label="Needs you" className="divide-y divide-border">
          {needs.map((item) => {
            const urgency = needUrgency(item, now);
            return (
              <ListRow
                key={item.key}
                href={item.href}
                leading={KIND_ICON[item.kind]}
                title={item.title}
                subtitle={needDetail(item, now)}
                meta={urgency ? <StatusTag tone={urgency.tone}>{urgency.label}</StatusTag> : null}
              />
            );
          })}
        </ul>
      ) : missing ? null : (
        <EmptyState icon={CircleCheck} title="Nothing needs you right now." className="py-10" />
      )}
    </Panel>
  );
}
