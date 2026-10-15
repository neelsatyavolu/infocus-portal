"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { Spinner } from "@/components/kit/spinner";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * A crash inside a Portal page keeps the sidebar and offers a retry instead of a blank screen:
 * the kit's page-size error state in one full-width card, on the content column's edges.
 */
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
    <Panel padding="none">
      <EmptyState
        size="page"
        align="start"
        tone="danger"
        role="alert"
        icon={AlertTriangle}
        eyebrow="Something went wrong"
        title={
          <span role="heading" aria-level={1}>
            This page didn&rsquo;t load
          </span>
        }
        description="Try again. If it keeps happening, send the reference below to a producer."
        meta={error.digest ? `Ref ${error.digest}` : null}
        className="md:px-5"
        action={
          <>
            <Button onClick={retry} disabled={retrying}>
              {retrying ? <Spinner /> : null}
              {retrying ? "Retrying…" : "Try again"}
            </Button>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
              Back to dashboard
            </Link>
          </>
        }
      />
    </Panel>
  );
}
