"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** A crash inside the call shows what went wrong instead of a blank screen. */
export default function MeetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Meeting crashed", error);
  }, [error]);

  const detail = [error.name, error.message].filter(Boolean).join(": ");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--ink)] px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <section className="w-full max-w-md space-y-3 border border-[var(--ink-4)] bg-[var(--ink-2)] p-6">
        <div className="eyebrow">Meeting</div>
        <h1 className="display-sm text-foreground">Something went wrong in the call</h1>
        <p className="break-words font-mono text-xs text-[var(--ink-text)]">
          {detail || "Unknown error"}
          {error.digest ? ` (ref ${error.digest})` : ""}
        </p>
        <Button onClick={reset}>Rejoin</Button>
      </section>
    </main>
  );
}
