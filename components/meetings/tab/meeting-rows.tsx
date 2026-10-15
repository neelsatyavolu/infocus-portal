import { Lock, ShieldCheck } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";
import type { MeetingNotesStatusValue, MeetingSummary } from "@/src/lib/meetings/types";

/**
 * Status tags for meetings (Meetings tab rows, the notes page, the call's info dialog).
 * The rows themselves live in now-panel, upcoming-panel and past-panel.
 */

/** Tag text for restricted meetings; null for meetings every producer can join. */
export function accessTagLabel(meeting: Pick<MeetingSummary, "access" | "inviteeCount">) {
  if (meeting.access === "EXECS_ONLY") return "Execs only";
  if (meeting.access === "INVITE_ONLY") {
    return `Invite only · ${meeting.inviteeCount} ${meeting.inviteeCount === 1 ? "person" : "people"}`;
  }
  return null;
}

export function AccessTag({
  meeting,
  size = "md"
}: {
  meeting: Pick<MeetingSummary, "access" | "inviteeCount">;
  size?: "sm" | "md";
}) {
  const label = accessTagLabel(meeting);
  if (!label) return null;
  return (
    <StatusTag tone="neutral" size={size} icon={meeting.access === "EXECS_ONLY" ? ShieldCheck : Lock}>
      {label}
    </StatusTag>
  );
}

const NOTES: Record<MeetingNotesStatusValue, { label: string; tone: StatusToneInput } | null> = {
  NONE: null,
  RECORDING: { label: "Recording", tone: "neutral" },
  PROCESSING: { label: "Processing notes", tone: "warning" },
  READY: { label: "Notes ready", tone: "success" },
  FAILED: { label: "Notes failed", tone: "danger" }
};

export function NotesTag({ status, size = "md" }: { status: MeetingNotesStatusValue; size?: "sm" | "md" }) {
  const tag = NOTES[status];
  return tag ? (
    <StatusTag tone={tag.tone} size={size}>
      {tag.label}
    </StatusTag>
  ) : null;
}

/** The LIVE tag: an Ink tag with the one Record Red dot. */
export function LiveTag({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <StatusTag tone="live" size={size}>
      Live
    </StatusTag>
  );
}
