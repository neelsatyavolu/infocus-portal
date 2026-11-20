"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { InlineError } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SettingsPanel, SettingsRow, SettingsSection } from "@/components/settings-layout";

type Term = 1 | 2;

type Summary = {
  packagesKept: number;
  packagesDeleted: number;
  mediaRemoved: number;
  grades: number;
  extensionRequests: number;
  producerNotes: number;
  blockedReason?: string | null;
};

const CONFIRM_TEXT: Record<Term, string> = { 1: "RESET S1", 2: "RESET S2" };
const CYCLES: Record<Term, string> = { 1: "cycles 1–3", 2: "cycles 4–6" };

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The counts a reset of `term` would remove, loaded when the dialog opens. */
function useResetPreview(term: Term | null) {
  // Tagged with its term, so a result for another semester reads as still loading.
  const [result, setResult] = useState<{ term: Term; summary: Summary | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    fetch(`/api/admin/reset-semester?term=${term}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        setResult(
          response.ok
            ? { term, summary: payload.data as Summary, error: null }
            : { term, summary: null, error: payload?.error?.message ?? "Couldn't count what this reset removes." }
        );
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ term, summary: null, error: "Couldn't count what this reset removes. Check your connection." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [term]);
  const current = result && result.term === term ? result : null;
  return { summary: current?.summary ?? null, error: current?.error ?? null, clear: () => setResult(null) };
}

/** Admin → Danger zone: clear a finished semester's package cycles (super admin and adviser). */
export function DangerZoneSection({ onReset }: { onReset: () => Promise<void> }) {
  const [term, setTerm] = useState<Term | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useResetPreview(term);

  function close() {
    setTerm(null);
    setConfirmInput("");
    setError(null);
    preview.clear();
  }

  function openFor(next: Term) {
    setError(null);
    setConfirmInput("");
    setTerm(next);
  }

  async function reset() {
    if (!term) return;
    setError(null);
    setResetting(true);
    try {
      const response = await fetch("/api/admin/reset-semester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, confirm: CONFIRM_TEXT[term] })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to reset the semester.");
        return;
      }
      const done = payload.data as Summary;
      toast.success(
        `Semester ${term} reset. Kept ${plural(done.packagesKept, "package")} for the publishing queue; removed ${plural(done.packagesDeleted, "package")}, ${plural(done.mediaRemoved, "video")} and ${plural(done.grades, "grade")}.`
      );
      close();
      await onReset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to reset the semester.");
    } finally {
      setResetting(false);
    }
  }

  const summary = preview.summary;

  return (
    <SettingsSection id="danger-zone" title="Danger zone" tone="danger">
      <SettingsPanel tone="danger">
        <SettingsRow
          title="Reset a semester"
          description="Start the next semester clean. Clears a finished semester's rosters, A-roll/B-roll, Initial Cuts, grades, extensions and cycle dates. Packages with a Final Cut stay on the publishing queue. Members and general producer notes stay. The current semester can't be reset."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive-quiet" onClick={() => openFor(1)}>
              <Trash2 aria-hidden="true" />
              Reset S1…
            </Button>
            <Button variant="destructive-quiet" onClick={() => openFor(2)}>
              <Trash2 aria-hidden="true" />
              Reset S2…
            </Button>
          </div>
        </SettingsRow>
      </SettingsPanel>

      <Dialog
        open={term !== null}
        onOpenChange={(next) => {
          if (!next && !resetting) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{term ? `Reset semester ${term}` : "Reset semester"}</DialogTitle>
            <DialogDescription>
              {term
                ? `Clears ${CYCLES[term]} so they start fresh. Videos go to Recently deleted and are removed from InFocus Drive after 7 days; everything else is deleted now and can't be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {summary?.blockedReason ? <InlineError>{summary.blockedReason}</InlineError> : null}
            {summary ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Stays on the queue</dt>
                <dd className="text-foreground">{plural(summary.packagesKept, "package")} with a Final Cut</dd>
                <dt className="text-muted-foreground">Deleted</dt>
                <dd className="text-foreground">
                  {plural(summary.packagesDeleted, "package")} without a Final Cut, {plural(summary.grades, "grade")},{" "}
                  {plural(summary.extensionRequests, "extension request")}, {plural(summary.producerNotes, "cycle note")}
                </dd>
                <dt className="text-muted-foreground">To Recently deleted</dt>
                <dd className="text-foreground">{plural(summary.mediaRemoved, "A-roll/B-roll clip or Initial Cut", "A-roll/B-roll clips and Initial Cuts")}</dd>
              </dl>
            ) : preview.error ? (
              <InlineError>{preview.error}</InlineError>
            ) : (
              <p className="text-sm text-muted-foreground">Counting what this removes…</p>
            )}
            {term ? (
              <div className="space-y-2">
                <label htmlFor="reset-semester-confirm" className="text-sm text-foreground">
                  Type <span className="font-mono font-semibold">{CONFIRM_TEXT[term]}</span> to enable the button.
                </label>
                <Input
                  id="reset-semester-confirm"
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  disabled={resetting}
                  autoComplete="off"
                  placeholder={CONFIRM_TEXT[term]}
                />
              </div>
            ) : null}
            {error ? <InlineError>{error}</InlineError> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void reset()}
              disabled={
                resetting || !term || !summary || Boolean(summary.blockedReason) || confirmInput !== CONFIRM_TEXT[term]
              }
            >
              {resetting ? "Resetting…" : term ? `Reset semester ${term}` : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
