"use client";

import { Sheet } from "@/components/kit/sheet";
import { pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { AgendaComposer, AgendaList, AgendaReorderHint, agendaCanAdd, agendaShowsReorderHint } from "./agenda-editor";
import type { useAgenda } from "./use-agenda";

/**
 * One meeting's agenda in a side sheet (a bottom sheet on phones): the sortable list scrolls,
 * and the add form and the reorder hint stay pinned in the footer so they never scroll out of
 * reach. Once a meeting is over the description says the agenda is read-only, and there's no
 * footer.
 */
export function AgendaSheet({
  open,
  onOpenChange,
  meetingId,
  title,
  startsAt,
  agenda
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  title: string;
  startsAt?: string;
  agenda: ReturnType<typeof useAgenda>;
}) {
  const showFooter = Boolean(meetingId) && (agendaCanAdd(agenda) || agendaShowsReorderHint(agenda));
  const name = title || "Meeting";
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Agenda"
      eyebrow={startsAt ? `${pacificDayLabel(startsAt)} · ${pacificTimeLabel(startsAt)}` : undefined}
      description={
        agenda.readOnly
          ? `${name}. This meeting is over, so its agenda is read-only.`
          : `${name}. Any producer can add, edit and reorder items.`
      }
      width="md"
      footer={
        showFooter ? (
          // The footer row holds controls at one height; the add form sets its own (h-11, h-9 from md).
          <div className="grid h-auto! w-full min-w-0 gap-2">
            <AgendaComposer agenda={agenda} />
            <AgendaReorderHint agenda={agenda} />
          </div>
        ) : null
      }
    >
      {meetingId ? <AgendaList agenda={agenda} /> : null}
    </Sheet>
  );
}
