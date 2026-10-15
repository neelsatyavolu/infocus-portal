"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, RotateCw } from "lucide-react";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PRODUCER_FEEDBACK_ENABLED, type ProducerFeedbackGroup } from "@/src/lib/producer-feedback";
import ProducerFeedbackForm from "./producer-feedback-form";

export const PRODUCER_FEEDBACK_INVITATION = "If you would like to submit feedback about your assigned producer, the execs would love to hear! This could be compliments, concerns, questions, suggestions, anything! Your response will not be revealed to anyone other than the executive producers, and we highly encourage filling this out at the end of the cycle.";

/**
 * Students' private review of their assigned producer. Paused (PRODUCER_FEEDBACK_ENABLED is false
 * until the user turns it back on), so this renders nothing for now. The trigger is an h-9
 * outline button so it matches the other header actions when it returns.
 */
export default function ProducerFeedbackDialog({
  initialCycle,
  triggerClassName
}: {
  initialCycle?: number;
  /** e.g. `max-sm:h-10` to match a 40px phone action row. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<ProducerFeedbackGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!PRODUCER_FEEDBACK_ENABLED || !open) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/producer-feedback", { cache: "no-store", signal: controller.signal });
        const payload = (await response.json()) as { data?: { groups: ProducerFeedbackGroup[] }; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to load your groups.");
        if (!controller.signal.aborted) setGroups(payload.data.groups);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load your groups.");
      }
    }
    void load();
    return () => controller.abort();
  }, [open, retry]);
  if (!PRODUCER_FEEDBACK_ENABLED) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setGroups(null);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={triggerClassName}>
          <MessageSquareText aria-hidden />
          Give feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Producer feedback</DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed">{PRODUCER_FEEDBACK_INVITATION}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger">{error}</p>
            <Button type="button" variant="outline" onClick={() => {
                setGroups(null);
                setError(null);
                setRetry((n) => n + 1);
              }}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          </div>
        ) : groups ? (
          <ProducerFeedbackForm groups={groups} initialCycle={initialCycle} />
        ) : (
          <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner />
            Loading your groups…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
