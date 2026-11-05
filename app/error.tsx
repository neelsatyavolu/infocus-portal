"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Crashes outside the Portal shell (sign-in, public pages) still get a way back. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page crashed", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <section role="alert" className="w-full max-w-md space-y-3 border border-[var(--ink-4)] bg-[var(--ink-2)] p-6">
        <div className="eyebrow">Something went wrong</div>
        <h1 className="display-sm text-foreground">This page didn&rsquo;t load</h1>
        {error.digest ? (
          <p className="break-words font-mono-broadcast text-xs text-[var(--ink-text)]">Ref {error.digest}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}
