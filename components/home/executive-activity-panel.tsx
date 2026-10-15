import { ListRow } from "@/components/kit/list-row";
import { Panel } from "@/components/kit/panel";
import { EmptyLine, PanelError } from "@/components/home/executive-list";
import type { ActivityEntry } from "@/components/home/executive-groups";
import { waitingAge } from "@/components/home/executive-needs";

/** The latest class events this cycle: sign-offs, uploads, Final Cuts, queued for air, grades published. */
export function ExecutiveActivityPanel({ entries, now, className }: { entries: ActivityEntry[] | null; now: Date; className?: string }) {
  return (
    <Panel id="home-class-activity" title="Recent class activity" titleAs="h2" padding="none" className={className}>
      {!entries ? (
        <PanelError>Couldn&apos;t load class activity.</PanelError>
      ) : entries.length === 0 ? (
        <EmptyLine>Nothing yet this cycle.</EmptyLine>
      ) : (
        <ul aria-label="Recent class activity" className="divide-y divide-border">
          {entries.map((entry) => (
            <ListRow
              key={entry.key}
              href={entry.href}
              title={entry.text}
              subtitle={entry.topic}
              meta={<span className="font-mono-broadcast tabular-nums">{`${waitingAge(new Date(entry.at), now)} ago`}</span>}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
