"use client";

import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PRODUCER_FEEDBACK_ENABLED, type ProducerFeedbackGroup } from "@/src/lib/producer-feedback";
import ProducerFeedbackForm from "./producer-feedback-form";

export const PRODUCER_FEEDBACK_INVITATION = "If you would like to submit feedback about your assigned producer, the execs would love to hear! This could be compliments, concerns, questions, suggestions, anything! Your response will not be revealed to anyone other than the executive producers, and we highly encourage filling this out at the end of the cycle.";

export default function ProducerFeedbackDialog({ initialCycle }: { initialCycle?: number }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<ProducerFeedbackGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!PRODUCER_FEEDBACK_ENABLED || !open) return;
    const controller = new AbortController();
    setGroups(null); setError(null);
    async function load() {
      try {
        const response = await fetch("/api/producer-feedback", { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { data?: { groups: ProducerFeedbackGroup[] }; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to load your groups.");
        if (!controller.signal.aborted) setGroups(payload.data.groups);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load your groups."); }
    }
    void load();
    return () => controller.abort();
  }, [open, retry]);
  if (!PRODUCER_FEEDBACK_ENABLED) return null;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline"><MessageSquareText className="mr-1.5 h-3.5 w-3.5" />Give Feedback</Button></DialogTrigger>
    <DialogContent className="max-w-2xl sm:rounded-2xl">
      <DialogHeader className="pr-6 text-left"><DialogTitle>Producer feedback</DialogTitle><DialogDescription className="pt-2 leading-relaxed">{PRODUCER_FEEDBACK_INVITATION}</DialogDescription></DialogHeader>
      {error ? <div role="alert" className="space-y-3"><p className="text-sm text-danger">{error}</p><Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>Try again</Button></div> : groups ? <ProducerFeedbackForm groups={groups} initialCycle={initialCycle} /> : <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading your groups…</p>}
    </DialogContent>
  </Dialog>;
}
