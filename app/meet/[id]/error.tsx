"use client";

import { useEffect } from "react";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { CallPlate, PlateData } from "@/components/meetings/call/status-plate";

/** A crash inside the call shows what went wrong instead of a blank screen. */
export default function MeetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Meeting crashed", error);
  }, [error]);

  const detail = [error.name, error.message].filter(Boolean).join(": ");

  return (
    <CallPlate
      eyebrow="Meeting"
      tag={<StatusTag tone="danger">Crashed</StatusTag>}
      title="Something went wrong in the call"
      actions={
        <>
          {/* A real navigation to the app's close URL: the iPhone app closes the call; the web lands on Meetings. */}
          <Button variant="outline" onClick={() => window.location.replace("/meetings?left=1")}>
            Leave
          </Button>
          <Button onClick={reset}>Rejoin</Button>
        </>
      }
    >
      <PlateData className="p-3">
        <p className="break-words font-mono text-xs text-[var(--ink-text)]">
          {detail || "Unknown error"}
          {error.digest ? ` (ref ${error.digest})` : ""}
        </p>
      </PlateData>
    </CallPlate>
  );
}
