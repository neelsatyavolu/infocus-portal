"use client";

import Link from "next/link";
import { StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";
import { Button, buttonVariants } from "@/components/ui/button";
import { useMeetEmbedded } from "./embed-context";
import { CallPlate } from "./status-plate";

/** Hidden in the iPhone app, which shows its own close button. */
export function BackToMeetings() {
  if (useMeetEmbedded()) return null;
  return (
    <Link href={"/meetings" as never} className={buttonVariants({ variant: "outline" })}>
      Back to Meetings
    </Link>
  );
}

export function WaitingScreen({ onLeave, meetingTitle }: { onLeave: () => void; meetingTitle?: string }) {
  return (
    <CallPlate
      ariaLive
      eyebrow="Lobby"
      tag={
        <StatusTag tone="warning" spinner>
          Waiting
        </StatusTag>
      }
      title="Waiting for a host to let you in…"
      body="Stay on this page. You'll join as soon as a host admits you."
      context={meetingTitle}
      actions={
        <Button variant="destructive-quiet" onClick={onLeave}>
          Leave
        </Button>
      }
    />
  );
}

export function DeniedScreen({ onAskAgain }: { onAskAgain: () => void }) {
  return (
    <CallPlate
      ariaLive
      eyebrow="Lobby"
      tag={<StatusTag tone="danger">Not let in</StatusTag>}
      title="A host didn't let you in"
      body="You can ask again if this was a mistake."
      actions={
        <>
          <BackToMeetings />
          <Button onClick={onAskAgain}>Ask again</Button>
        </>
      }
    />
  );
}

/** The "joining" stage, after Join is pressed (loading before that is PreJoinSkeleton). */
export function JoiningScreen() {
  return (
    <CallPlate
      ariaLive
      eyebrow="Meeting"
      tag={
        <StatusTag tone="neutral" spinner>
          Joining
        </StatusTag>
      }
      title="Joining the meeting…"
    />
  );
}

/** Reloads this meeting's URL: the middleware sends a signed-out visitor to sign-in and back here. */
function SignInAgain() {
  return (
    <a href={typeof window === "undefined" ? "/" : window.location.href} className={buttonVariants()}>
      Sign in again
    </a>
  );
}

type EndKind = "left" | "removed" | "ended" | "error" | "unsupported" | "full" | "signin";

const END_TAG: Record<EndKind, { tone: StatusToneInput; label: string }> = {
  left: { tone: "neutral", label: "Left" },
  removed: { tone: "danger", label: "Removed" },
  ended: { tone: "neutral", label: "Ended" },
  error: { tone: "danger", label: "Error" },
  signin: { tone: "warning", label: "Signed out" },
  full: { tone: "warning", label: "Full" },
  unsupported: { tone: "warning", label: "Browser not supported" }
};

export function EndScreen({
  kind,
  message,
  onRejoin
}: {
  kind: EndKind;
  message?: string | null;
  onRejoin?: () => void;
}) {
  const embedded = useMeetEmbedded();
  const copy = {
    left: { title: "You left the meeting", body: undefined },
    removed: { title: "You were removed from the meeting", body: "A host removed you. You can't rejoin with this link." },
    ended: { title: "The meeting has ended", body: "A host ended the meeting for everyone." },
    error: { title: "Couldn't join the meeting", body: message ?? "Something went wrong. Try again." },
    signin: { title: "Your sign-in expired", body: "Sign in again to get back into the meeting." },
    full: { title: "The meeting is full", body: "No more people can join right now. Try again later." },
    unsupported: { title: "This browser can't join", body: message ?? "Use a current Chrome or Safari." }
  }[kind];
  const rejoin = Boolean(onRejoin) && (kind === "left" || kind === "error" || kind === "full");
  const hasActions = rejoin || kind === "signin" || !embedded;
  const tag = END_TAG[kind];
  return (
    <CallPlate
      ariaLive
      eyebrow="Meeting"
      tag={<StatusTag tone={tag.tone}>{tag.label}</StatusTag>}
      title={copy.title}
      body={copy.body}
      actions={
        hasActions ? (
          <>
            <BackToMeetings />
            {rejoin ? <Button onClick={onRejoin}>Rejoin</Button> : null}
            {kind === "signin" ? <SignInAgain /> : null}
          </>
        ) : undefined
      }
    />
  );
}
