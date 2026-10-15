"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Check, List, Mic2, RefreshCcw, Save } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { paTimeLabel } from "@/src/lib/pa-script";

type PaResponse = {
  date: string | null;
  dateLabel: string;
  announcers: string[];
  canEdit: boolean;
  autofill?: { status: "ok" | "warning" | "unavailable"; message?: string };
  script: { content: string; version: number } | null;
};

const PA_CACHE_KEY = "announcements-pa";

async function readResponse(response: Response): Promise<PaResponse> {
  const payload = (await response.json()) as {
    data?: PaResponse;
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Could not load the PA script. Please try again.");
  }
  return payload.data;
}

export default function PaAnnouncementsPage() {
  const [data, setData] = useState<PaResponse | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = data?.script != null && content !== data.script.content;

  function applyData(next: PaResponse) {
    setData(next);
    setContent(next.script?.content ?? "");
  }

  /** `cached` (first view only) shows the last copy at once and refreshes it quietly (src/lib/client-cache.ts). */
  async function loadData(options?: { cached?: boolean }) {
    const cached = options?.cached ? cachedValue<PaResponse>(PA_CACHE_KEY) : undefined;
    // The page renders the cached copy while `loading`; the editor stays locked until fresh data lands.
    if (cached) applyData(cached);
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const next = await readResponse(await fetch("/api/announcements/pa", { cache: "no-store" }));
      rememberValue(PA_CACHE_KEY, next);
      applyData(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the PA script.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData({ cached: true });
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  async function saveScript() {
    if (!data?.date || !data.script || !data.canEdit || !dirty || saving || regenerating) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await readResponse(await fetch("/api/announcements/pa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.date, content, version: data.script.version })
      }));
      setData(next);
      setContent(next.script?.content ?? "");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the PA script. Your draft is still here.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateScript() {
    if (!data?.date || !data.script || !data.canEdit || saving || loading || regenerating) return;
    setRegenerateOpen(false);
    setRegenerating(true);
    setError(null);
    setSaved(false);
    try {
      const next = await readResponse(await fetch("/api/announcements/pa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.date, version: data.script.version })
      }));
      setData(next);
      setContent(next.script?.content ?? "");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not regenerate the PA script. Your draft is still here.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={<><Mic2 className="h-3 w-3" />InFocus announcements</>}
        title="PA"
        description={
          <>
            Your script for the next PA. Read at the start of second period on school Mondays unless the bell schedule changes.
            {data?.date ? ` · ${data.dateLabel} · ${paTimeLabel(data.date)}` : null}
          </>
        }
        actions={
          <Button variant="outline" onClick={() => void loadData()} disabled={loading || saving || regenerating || dirty}
            title={dirty ? "Save or discard your changes before refreshing." : "Refresh the script and assignments"}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-tint px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {data?.autofill?.message ? <p role="status" className="rounded-md border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">{data.autofill.message}</p> : null}

      {loading && !data ? (
        <div role="status" className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">Loading the PA script...</div>
      ) : data?.date && data.script ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">PA script</h2>
                <p id="pa-script-help" className="mt-1 text-xs text-muted-foreground">
                  {data.canEdit ? "Edit the shared script, then save your changes before leaving." : "Assigned announcers and producers can edit this script."}
                </p>
              </div>
              <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs ${dirty ? "text-amber-200" : "text-muted-foreground"}`}>
                {regenerating ? "Regenerating..." : saving ? "Saving..." : dirty ? "Unsaved changes" : saved ? <><Check className="h-3.5 w-3.5" />Saved</> : data.canEdit ? "Shared script" : "Read only"}
              </span>
            </div>
            <div className="p-3 md:p-5">
              <label htmlFor="pa-script" className="sr-only">PA script for {data.dateLabel}</label>
              <Textarea id="pa-script" aria-describedby="pa-script-help" value={content} readOnly={!data.canEdit}
                disabled={saving || loading || regenerating} rows={26} maxLength={100000}
                onChange={(event) => { setContent(event.target.value); setSaved(false); }}
                className="min-h-[560px] resize-y rounded-md border-border bg-background/40 p-4 text-sm leading-7 md:p-5 md:text-sm" />
            </div>
            {data.canEdit ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
                <p className="text-xs text-muted-foreground">Changes are shared with your PA team.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" disabled={saving || loading || regenerating} onClick={() => setRegenerateOpen(true)}>
                    <RefreshCcw className={`mr-2 h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />{regenerating ? "Regenerating..." : "Regenerate"}
                  </Button>
                  {dirty ? <Button variant="ghost" disabled={saving || loading || regenerating} onClick={() => setDiscardOpen(true)}>Discard changes</Button> : null}
                  <Button disabled={!dirty || saving || loading || regenerating || !content.trim()} onClick={() => void saveScript()}>
                    <Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save script"}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
          <aside className="space-y-4">
            <section className="rounded-md border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">On the mic</h2>
              <p className="mt-1 text-xs text-muted-foreground">Assigned in the Master Calendar.</p>
              <div className="mt-4 space-y-3">
                {[0, 1].map((index) => (
                  <div key={index} className="rounded-md border border-border bg-secondary/40 px-3 py-3">
                    <p className="eyebrow">Announcer {index + 1}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{data.announcers[index] || "Not assigned yet"}</p>
                  </div>
                ))}
              </div>
              <Link href={"/master-calendar" as never} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                <CalendarDays className="h-4 w-4" />Master Calendar<span className="sr-only"> in a new tab</span>
              </Link>
            </section>
            <section className="rounded-md border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">Announcements to read</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Untouched scripts auto-fill with announcements for the PA date, formatted with Gemini. Review the wording before reading. Saved edits are preserved.</p>
              <Link href={"/announcements/submitted" as never} target="_blank" rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
                <List className="h-4 w-4" />Open Submitted<span className="sr-only"> in a new tab</span>
              </Link>
            </section>
          </aside>
        </div>
      ) : data ? (
        <section className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <Mic2 className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">No upcoming PA</h2>
          <p className="mt-2 text-sm text-muted-foreground">There are no remaining PA dates on the school calendar.</p>
          <Link href={"/master-calendar" as never} className="mt-4 inline-block text-sm underline underline-offset-4">View Master Calendar</Link>
        </section>
      ) : null}

      <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate the PA script?</DialogTitle>
            <DialogDescription>This replaces the shared script and any unsaved edits with a new script using the latest announcements and assigned names. The result is saved for your PA team.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void regenerateScript()}>Regenerate script</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard your changes?</DialogTitle>
            <DialogDescription>Your unsaved edits will be removed. The saved script will stay unchanged.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>Keep editing</Button>
            <Button variant="destructive" onClick={() => { setContent(data?.script?.content ?? ""); setSaved(false); setDiscardOpen(false); }}>Discard changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
