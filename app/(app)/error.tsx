"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

/** A crash inside a Portal page keeps the sidebar and offers a retry instead of a blank screen. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    console.error("Portal page crashed", error);
  }, [error]);

  function retry() {
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <section role="alert" className="mx-auto mt-10 w-full max-w-md space-y-3 border border-[var(--ink-4)] bg-[var(--ink-2)] p-6">
      <div className="eyebrow">Something went wrong</div>
      <h1 className="display-sm text-foreground">This page didn&rsquo;t load</h1>
      <p className="text-sm text-muted-foreground">
        Try again. If it keeps happening, send the reference below to a producer.
      </p>
      {error.digest ? (
        <p className="break-words font-mono-broadcast text-xs text-[var(--ink-text)]">Ref {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={retry} disabled={retrying}>
          {retrying ? "Retrying…" : "Try again"}
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
