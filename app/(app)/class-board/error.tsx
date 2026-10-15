"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Spinner } from "@/components/kit/spinner";
import { StatusPlate } from "@/components/kit/status-plate";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { clearBoardRetries, noteBoardRetry } from "./board-retry";

/** One soft retry every 30 seconds, so a classroom TV recovers without anyone touching it. */
const RETRY_SECONDS = 30;
/** After this many soft retries without data (5 minutes), a full reload picks up a fixed deploy. */
const RELOAD_AFTER_RETRIES = 10;

/**
 * Kiosk-safe error for the Class Board: a live "Trying again in Ns" so a classroom TV recovers by
 * itself, Try again, and (as on every Portal error page) a way back to the dashboard for anyone
 * on a laptop, since the board hides the sidebar.
 */
export default function ClassBoardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [seconds, setSeconds] = useState(RETRY_SECONDS);
  const secondsLeft = useRef(RETRY_SECONDS);
  const retryRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    console.error("Class Board crashed", error);
  }, [error]);

  function retry() {
    secondsLeft.current = RETRY_SECONDS;
    setSeconds(RETRY_SECONDS);
    // Offline, a refresh can fall back to a full navigation and strand the TV on an offline page.
    if (!navigator.onLine) return;
    if (noteBoardRetry() > RELOAD_AFTER_RETRIES) {
      clearBoardRetries();
      window.location.reload();
      return;
    }
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

  useEffect(() => {
    retryRef.current = retry;
  });

  // A steady countdown: it keeps going whether a failed retry re-renders or remounts this page.
  useEffect(() => {
    const timer = window.setInterval(() => {
      secondsLeft.current -= 1;
      if (secondsLeft.current <= 0) retryRef.current();
      else setSeconds(secondsLeft.current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <StatusPlate
      className="h-dvh overflow-y-auto bg-background"
      eyebrow="Class Board"
      tag={
        retrying ? (
          <StatusTag spinner>Retrying</StatusTag>
        ) : (
          <StatusTag tone="danger" icon={AlertTriangle}>
            Error
          </StatusTag>
        )
      }
      title={<>The board didn&rsquo;t load</>}
      body={
        <>
          {retrying ? "Trying again now…" : `Trying again in ${seconds}s.`} If it keeps happening, send the reference
          below to a producer.
        </>
      }
      actions={
        <>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Back to dashboard
          </Link>
          <Button type="button" onClick={retry} disabled={retrying}>
            {retrying ? <Spinner /> : null}
            Try again
          </Button>
        </>
      }
    >
      {error.digest ? (
        <p className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">Ref {error.digest}</p>
      ) : null}
    </StatusPlate>
  );
}
