"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

function Screen({ eyebrow, title, body, children }: { eyebrow: string; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <section className="w-full max-w-md space-y-3 border border-[var(--ink-4)] bg-[var(--ink-2)] p-6" aria-live="polite">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="display-sm text-foreground">{title}</h1>
        {body ? <p className="text-sm text-[var(--ink-text)]">{body}</p> : null}
        {children ? <div className="flex flex-wrap gap-2 pt-2">{children}</div> : null}
      </section>
    </main>
  );
}

const backLink = (
  <Link href={"/meetings" as never} className={buttonVariants({ variant: "outline" })}>
    Back to Meetings
  </Link>
);

export function WaitingScreen({ onLeave }: { onLeave: () => void }) {
  return (
    <Screen eyebrow="Lobby" title="Waiting for a host to let you in…" body="Stay on this page. You'll join as soon as a host admits you.">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Waiting
      </span>
      <Button variant="destructive-quiet" onClick={onLeave}>
        Leave
      </Button>
    </Screen>
  );
}

export function DeniedScreen({ onAskAgain }: { onAskAgain: () => void }) {
  return (
    <Screen eyebrow="Lobby" title="A host didn't let you in" body="You can ask again if this was a mistake.">
      <Button onClick={onAskAgain}>Ask again</Button>
      {backLink}
    </Screen>
  );
}

export function JoiningScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Joining…
    </main>
  );
}

export function EndScreen({
  kind,
  message,
  onRejoin
}: {
  kind: "left" | "removed" | "ended" | "error" | "unsupported" | "full";
  message?: string | null;
  onRejoin?: () => void;
}) {
  const copy = {
    left: { title: "You left the meeting", body: undefined },
    removed: { title: "You were removed from the meeting", body: "A host removed you. You can't rejoin with this link." },
    ended: { title: "The meeting has ended", body: "A host ended the meeting for everyone." },
    error: { title: "Couldn't join the meeting", body: message ?? "Something went wrong. Try again." },
    full: { title: "The meeting is full", body: "No more people can join right now. Try again later." },
    unsupported: { title: "This browser can't join", body: message ?? "Use a current Chrome or Safari." }
  }[kind];
  return (
    <Screen eyebrow="Meeting" title={copy.title} body={copy.body}>
      {onRejoin && (kind === "left" || kind === "error" || kind === "full") ? <Button onClick={onRejoin}>Rejoin</Button> : null}
      {backLink}
    </Screen>
  );
}
