"use client";

import { useState } from "react";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";
import type { ProducerFeedbackGroup } from "@/src/lib/producer-feedback";

const QUESTIONS = [
  {
    key: "helpfulness",
    label: "How useful is their feedback?",
    detail: "Does it help your group make clear improvements?"
  },
  {
    key: "communication",
    label: "How well do they communicate?",
    detail: "Are expectations and responses clear and timely?"
  },
  {
    key: "support",
    label: "How well do they support your group?",
    detail: "Do they help you get unstuck and keep the package moving?"
  }
] as const;
const RATINGS = ["1 · Not at all", "2 · A little", "3 · Somewhat", "4 · Well", "5 · Very well"];

const FIELD_LABEL = "text-sm font-medium text-foreground";

function ReviewForm({ group, saved }: { group: ProducerFeedbackGroup; saved: () => void }) {
  const [ratings, setRatings] = useState({ helpfulness: "", communication: "", support: "" });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/producer-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId: group.rowId,
          body,
          helpfulness: Number(ratings.helpfulness),
          communication: Number(ratings.communication),
          support: Number(ratings.support)
        })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Unable to save your review.");
      saved();
      setBody("");
      setRatings({ helpfulness: "", communication: "", support: "" });
      setMessage("Your group's review has been saved for the executive producers.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save your review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 rounded-md border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{group.topic}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Associate producer: {group.producerName ?? "Not assigned"}
          </p>
        </div>
        <StatusTag tone={group.submitted ? "success" : "neutral"}>
          {group.submitted ? "Review submitted" : "Not submitted"}
        </StatusTag>
      </div>
      {!group.producerName ? (
        <p className="text-sm text-muted-foreground">You can submit once an associate producer is assigned.</p>
      ) : (
        <>
          {QUESTIONS.map((question) => (
            <label key={question.key} className="block space-y-1.5">
              <span className="block">
                <span className={FIELD_LABEL}>{question.label}</span>
                <span className="block text-[13px] text-muted-foreground">{question.detail}</span>
              </span>
              <NativeSelect
                required
                disabled={busy}
                value={ratings[question.key]}
                onChange={(e) => setRatings((old) => ({ ...old, [question.key]: e.target.value }))}
                placeholderOption="Choose a rating"
              >
                {RATINGS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
          <label className="block space-y-1.5">
            <span className={FIELD_LABEL}>What has helped, and what could improve?</span>
            <Textarea
              required
              minLength={10}
              maxLength={2000}
              rows={5}
              disabled={busy}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (!isSubmitShortcut(e)) return;
                e.preventDefault();
                if (!busy) e.currentTarget.form?.requestSubmit();
              }}
              placeholder="Use specific examples about the support and feedback your group received."
            />
            <span className="block font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">
              10–2,000 characters · {body.length}/2,000
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : group.submitted ? "Replace group review" : "Submit group review"}
            </Button>
            <SubmitShortcutHint action="submit" />
          </div>
        </>
      )}
      {message && (
        <p role="status" className="text-sm text-[var(--brand-green)]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export default function ProducerFeedbackForm({
  groups: initialGroups,
  initialCycle
}: {
  groups: ProducerFeedbackGroup[];
  initialCycle?: number;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const cycles = [...new Set(groups.map((g) => g.cycleNumber))].sort((a, b) => b - a);
  const [cycle, setCycle] = useState(initialCycle && cycles.includes(initialCycle) ? initialCycle : (cycles[0] ?? 1));
  const [selected, setSelected] = useState("");
  const cycleGroups = groups.filter((g) => g.cycleNumber === cycle);
  const group = cycleGroups.find((g) => g.rowId === selected) ?? cycleGroups[0];
  return (
    <div className="space-y-5">
      {!groups.length ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          You’ll be able to leave feedback once you’re on a package group’s roster.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Cycle
              <NativeSelect
                aria-label="Feedback cycle"
                value={cycle}
                onChange={(e) => {
                  setCycle(Number(e.target.value));
                  setSelected("");
                }}
                wrapperClassName="w-32"
              >
                {cycles.map((c) => (
                  <option key={c} value={c}>
                    Cycle {c}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {cycleGroups.length > 1 && (
              <label className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                Group
                <NativeSelect
                  aria-label="Feedback group"
                  value={group?.rowId}
                  onChange={(e) => setSelected(e.target.value)}
                  wrapperClassName="w-64 max-w-full"
                >
                  {cycleGroups.map((g) => (
                    <option key={g.rowId} value={g.rowId}>
                      {g.topic}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
          </div>
          {group && (
            <ReviewForm
              key={group.rowId}
              group={group}
              saved={() =>
                setGroups((previous) => previous.map((g) => (g.rowId === group.rowId ? { ...g, submitted: true } : g)))
              }
            />
          )}
        </>
      )}
    </div>
  );
}
