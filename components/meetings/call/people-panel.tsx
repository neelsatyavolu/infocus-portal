"use client";

import { useState, type ReactNode } from "react";
import { Hand, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MeetingClientMessage, MeetingParticipantView, MeetingWaitingView } from "@/src/lib/meetings/protocol";
import { meetingsApi } from "@/src/lib/meetings/client/api";
import { cn } from "@/src/lib/utils";
import { ConfirmDialog } from "../confirm-dialog";
import { CallCount } from "./call-count";
import { admitAll, admitOne, denyOne, hostAct } from "./host-actions";
import { PeopleRow, WaitingRow, type RowSize } from "./people-row";
import { SidePanel } from "./side-panel";

/** A list with a 36px header: caps label + count, and at most one action for that list. */
function PeopleSection({
  label,
  count,
  tone = "neutral",
  action,
  touch,
  children
}: {
  label: string;
  count: number;
  tone?: "neutral" | "warn";
  action?: ReactNode;
  touch: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="border-b border-[var(--ink-4)] py-2 last:border-b-0">
      <div className={cn("flex items-center justify-between gap-2 pl-4 pr-2", touch ? "min-h-11" : "min-h-9")}>
        <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
          {label}
          <CallCount count={count} tone={tone} showZero />
        </h3>
        {action}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

export function PeoplePanel({
  meetingId,
  selfUid,
  isHost,
  participants,
  hands,
  waiting,
  send,
  onClose,
  mobile
}: {
  meetingId: string;
  selfUid: string | null;
  isHost: boolean;
  participants: MeetingParticipantView[];
  /** uid → raised-hand queue position. */
  hands: Readonly<Record<string, number>>;
  waiting: readonly MeetingWaitingView[];
  send: (message: MeetingClientMessage) => boolean;
  onClose: () => void;
  mobile: boolean;
}) {
  const [removing, setRemoving] = useState<MeetingParticipantView | null>(null);
  const people = participants.filter((p) => !p.isScribe);
  // Each person appears in one list: raised hands (in queue order), then everyone else.
  const raised = people.filter((p) => hands[p.uid]).sort((a, b) => hands[a.uid] - hands[b.uid]);
  const others = people.filter((p) => !hands[p.uid]);
  const size: RowSize = mobile ? "touch" : "md";
  // One control height per panel: 44px on phones (as the waiting rows), 32px on desktop.
  const action = mobile ? "h-11" : "h-8";

  const hostSend = (message: MeetingClientMessage, done: string) => {
    if (send(message)) toast.success(done);
    else toast.error("You're offline. Try again in a moment.");
  };

  const row = (p: MeetingParticipantView, handColumns: boolean) => (
    <PeopleRow
      key={p.uid}
      person={p}
      isSelf={p.uid === selfUid}
      isHost={isHost}
      handPosition={hands[p.uid]}
      handColumns={handColumns}
      hostSend={hostSend}
      onRemove={() => setRemoving(p)}
      size={size}
    />
  );

  return (
    <SidePanel title={`People (${people.length})`} onClose={onClose} mobile={mobile}>
      {isHost && waiting.length > 0 ? (
        <PeopleSection
          label="Waiting to join"
          count={waiting.length}
          tone="warn"
          touch={mobile}
          action={
            waiting.length > 1 ? (
              <Button size="sm" className={action} onClick={() => void admitAll(meetingId)}>
                Admit all
              </Button>
            ) : null
          }
        >
          {waiting.map((w) => (
            <WaitingRow
              key={w.uid}
              person={w}
              single={waiting.length === 1}
              size={size}
              onDeny={() => void denyOne(meetingId, w.uid, w.name)}
              // Admit can be pressed again for someone still in the lobby: it re-sends the "come in".
              onAdmit={() => void admitOne(meetingId, w.uid, w.name)}
            />
          ))}
        </PeopleSection>
      ) : null}

      {raised.length > 0 ? (
        <PeopleSection
          label="Raised hands"
          count={raised.length}
          touch={mobile}
          action={
            isHost ? (
              <Button size="sm" variant="outline" className={action} onClick={() => hostSend({ t: "lowerAllHands" }, "Lowered all hands.")}>
                <Hand aria-hidden /> Lower all
              </Button>
            ) : null
          }
        >
          {raised.map((p) => row(p, true))}
        </PeopleSection>
      ) : null}

      <PeopleSection
        label="In the call"
        count={others.length}
        touch={mobile}
        action={
          isHost ? (
            <Button size="sm" variant="outline" className={action} onClick={() => hostSend({ t: "muteAll" }, "Muted everyone.")}>
              <MicOff aria-hidden /> Mute all
            </Button>
          ) : null
        }
      >
        {others.map((p) => row(p, false))}
      </PeopleSection>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""}?`}
        description="They leave the call right away and can't rejoin. The meeting key changes for everyone."
        confirmLabel="Remove"
        onConfirm={() =>
          removing ? hostAct(meetingsApi.participant(meetingId, removing.uid, "remove"), `Removed ${removing.name}.`) : undefined
        }
      />
    </SidePanel>
  );
}
