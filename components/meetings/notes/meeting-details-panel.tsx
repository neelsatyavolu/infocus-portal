import { KeyValueList } from "@/components/kit/key-value";
import { Panel } from "@/components/kit/panel";
import type { MeetingDetail } from "@/src/lib/meetings/types";
import { pacificTimeLabel } from "@/src/lib/meetings/client/time";

/**
 * When the call really started and ended (the header line has the scheduled time, the length and
 * how many came).
 */
export function MeetingDetailsPanel({ meeting }: { meeting: MeetingDetail }) {
  return (
    <Panel id="meeting-details" title="Details" titleAs="h2">
      <KeyValueList
        dense
        labelWidth="5.5rem"
        items={[
          { label: "Started", value: meeting.startedAt ? pacificTimeLabel(meeting.startedAt) : "—", mono: Boolean(meeting.startedAt) },
          { label: "Ended", value: meeting.endedAt ? pacificTimeLabel(meeting.endedAt) : "—", mono: Boolean(meeting.endedAt) }
        ]}
      />
    </Panel>
  );
}

/**
 * Who's invited, as a list. Shown when someone is invited or the viewer can edit the list
 * (hosts edit it from "Edit invited people" in the page header).
 */
export function MeetingInvitedPanel({ meeting, canEdit }: { meeting: MeetingDetail; canEdit: boolean }) {
  if (meeting.invitees.length === 0 && !canEdit) return null;
  return (
    <Panel id="meeting-invited" title="Invited" titleAs="h2" count={meeting.invitees.length}>
      {meeting.invitees.length > 0 ? (
        <ul className="divide-y divide-border">
          {meeting.invitees.map((person) => (
            <li key={person.id} className="truncate py-2 text-sm text-foreground first:pt-0 last:pb-0">
              {person.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {meeting.access === "OPEN" ? "No one picked, so every producer gets the start notification." : "No one picked yet."}
        </p>
      )}
    </Panel>
  );
}
