import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/src/lib/utils";
import { Avatar } from "./avatar";
import { PREJOIN_CONTAINER } from "./prejoin-layout";

/** The pre-join bar (56px plus the top safe area), on the same container as the page below it. */
export function MeetBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header className="shrink-0 border-b border-[var(--ink-4)] bg-[var(--ink)] pt-[env(safe-area-inset-top)]">
      <div className={cn(PREJOIN_CONTAINER, "flex h-14 items-center justify-between gap-4")}>
        <div className="flex min-w-0 items-center gap-3">{left}</div>
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
    </header>
  );
}

export function MeetingsMark() {
  return (
    <>
      <Image src="/favicon/infocus-hub-icon.png" alt="" width={24} height={24} className="h-6 w-6 rounded-sm" />
      <span className="text-sm font-semibold text-foreground">Meetings</span>
    </>
  );
}

/**
 * Pre-join bar: logo mark + "Meetings" left, the signed-in person's avatar right. The name is
 * already on the preview, so the bar shows it only as hover text and to screen readers.
 */
export function PreJoinBar({ userName }: { userName: string }) {
  return (
    <MeetBar
      left={<MeetingsMark />}
      right={
        <span role="img" aria-label={`Signed in as ${userName}`} title={userName} className="inline-flex">
          <Avatar name={userName} size="sm" />
        </span>
      }
    />
  );
}
