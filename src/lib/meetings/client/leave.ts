import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";

export type LeaveAction = "leave" | "end" | "cancel";

export type LeaveChoices = {
  title: string;
  description: string | null;
  actions: readonly LeaveAction[];
};

/**
 * What the Leave confirm offers. Non-hosts: Leave or Cancel. Hosts: Just leave, End for
 * everyone, or Cancel, with copy about who keeps running the meeting.
 */
export function leaveChoices(input: {
  isHost: boolean;
  selfUid: string | null;
  participants: readonly Pick<MeetingParticipantView, "uid" | "isHost" | "isScribe">[];
}): LeaveChoices {
  if (!input.isHost) {
    return { title: "Leave the meeting?", description: null, actions: ["leave", "cancel"] };
  }
  const others = input.participants.filter((p) => p.uid !== input.selfUid && !p.isScribe);
  const otherHosts = others.some((p) => p.isHost);
  const description = otherHosts
    ? "Other hosts will keep running the meeting."
    : others.length > 0
      ? "Host passes to the next exec here, or else to the producer who's been here longest."
      : "You're the only one here. The meeting ends when everyone has left.";
  return { title: "Leave the meeting?", description, actions: ["leave", "end", "cancel"] };
}
