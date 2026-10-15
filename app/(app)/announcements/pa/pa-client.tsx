"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mic2, RefreshCw } from "lucide-react";
import { PaEditorSkeleton } from "@/components/announcements/announcements-skeletons";
import { PaEditorPanel, type PaActionError } from "@/components/announcements/pa-editor-panel";
import {
  AnnouncementsToReadNote,
  AnnouncementsToReadPanel,
  OnTheMicLine,
  OnTheMicPanel
} from "@/components/announcements/pa-side-panels";
import { HUB_RAIL_GRID, HUB_RAIL_STICKY } from "@/components/announcements/sizes";
import { useLeaveGuard } from "@/components/announcements/use-leave-guard";
import { useSaveShortcut } from "@/components/announcements/use-save-shortcut";
import { Alert } from "@/components/kit/alert";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { paTimeLabel } from "@/src/lib/pa-script";
import { cn } from "@/src/lib/utils";

export type PaResponse = {
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

export default function PaClient({ initialData }: { initialData: PaResponse | null }) {
  const router = useRouter();
  // The server's copy (page.tsx) is fresh, so the editor opens unlocked on the first frame.
  const [data, setData] = useState<PaResponse | null>(initialData);
  const [content, setContent] = useState(initialData?.script?.content ?? "");
  const [loading, setLoading] = useState(initialData === null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  /** A failed load (top of the page). Save and regenerate failures show in the editor instead. */
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<PaActionError | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  /** Where an in-app link was going when the discard prompt opened for unsaved edits. */
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const dirty = data?.script != null && content !== data.script.content;
  const canEdit = Boolean(data?.canEdit);
  // The Save button's rule; ⌘S uses the same one.
  const canSave = dirty && !saving && !loading && !regenerating && content.trim().length > 0;

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
    setActionError(null);
    setSaved(false);
    try {
      applyData(await readResponse(await fetch("/api/announcements/pa", { cache: "no-store" })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the PA script.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialData) return;
    void loadData({ cached: true });
    // First view only (and only without the server's copy); later loads come from Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the tab cache in step with the last loaded or saved script, so coming back never
  // flashes the version from before a save.
  useEffect(() => {
    if (data) rememberValue(PA_CACHE_KEY, data);
  }, [data]);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  // beforeunload misses in-app links (hub tabs, sidebar): ask before they drop unsaved edits.
  useLeaveGuard(dirty, (href) => {
    setPendingHref(href);
    setDiscardOpen(true);
  });

  async function saveScript() {
    if (!data?.date || !data.script || !data.canEdit || !dirty || saving || regenerating) return;
    setSaving(true);
    setActionError(null);
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
      setActionError({
        action: "save",
        message: cause instanceof Error ? cause.message : "Could not save the PA script. Your draft is still here."
      });
    } finally {
      setSaving(false);
    }
  }

  useSaveShortcut(() => {
    if (canSave) void saveScript();
  }, canEdit);

  async function regenerateScript() {
    if (!data?.date || !data.script || !data.canEdit || saving || loading || regenerating) return;
    setRegenerateOpen(false);
    setRegenerating(true);
    setActionError(null);
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
      setActionError({
        action: "regenerate",
        message: cause instanceof Error ? cause.message : "Could not regenerate the PA script. Your draft is still here."
      });
    } finally {
      setRegenerating(false);
    }
  }

  const hasScript = Boolean(data?.date && data.script);

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={<><Mic2 className="h-3 w-3" />Next PA</>}
        title={
          data?.date ? (
            <>
              <span className="sr-only">PA, </span>
              {data.dateLabel}
            </>
          ) : loading && !data ? (
            <>
              <span className="sr-only">PA</span>
              <Skeleton className="h-8 w-80 max-w-full" />
            </>
          ) : (
            "PA"
          )
        }
        description={
          data?.date ? (
            <>
              <p>{`${paTimeLabel(data.date)}. Read on school Mondays unless the bell schedule changes.`}</p>
              {/* Below xl there is no rail, so who reads (and the Master Calendar link) is said up here. */}
              <OnTheMicLine announcers={data.announcers} className="mt-1 xl:hidden" />
            </>
          ) : (
            "Read at the start of second period on school Mondays unless the bell schedule changes."
          )
        }
      />

      {error && data ? <Alert tone="danger">{error}</Alert> : null}

      {data?.autofill?.message ? <Alert tone="warning" role="status">{data.autofill.message}</Alert> : null}

      {loading && !data ? (
        <LoadingRegion label="Loading the PA script…">
          <PaEditorSkeleton />
        </LoadingRegion>
      ) : data && hasScript ? (
        <div className={HUB_RAIL_GRID}>
          <PaEditorPanel
            dateLabel={data.dateLabel}
            canEdit={data.canEdit}
            content={content}
            onContentChange={(value) => {
              setContent(value);
              setSaved(false);
            }}
            loading={loading}
            saving={saving}
            regenerating={regenerating}
            dirty={dirty}
            saved={saved}
            failed={actionError}
            canSave={canSave}
            onSave={() => void saveScript()}
            onRequestDiscard={() => setDiscardOpen(true)}
            onRequestRegenerate={() => setRegenerateOpen(true)}
            onRefresh={() => void loadData()}
          />
          {/* A sticky rail from xl; below it the page header says who is on the mic and a note under
              the editor says where its announcements come from. */}
          <aside className={`hidden space-y-5 xl:block ${HUB_RAIL_STICKY}`}>
            <OnTheMicPanel announcers={data.announcers} />
            <AnnouncementsToReadPanel />
          </aside>
          <AnnouncementsToReadNote className="xl:hidden" />
        </div>
      ) : data ? (
        <div className="rounded-md border border-border bg-card">
          <EmptyState
            size="page"
            icon={Mic2}
            title="No upcoming PA"
            description="There are no remaining PA dates on the school calendar."
            action={
              <>
                <Button type="button" variant="outline" disabled={loading} onClick={() => void loadData()}>
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  {loading ? "Loading…" : "Refresh"}
                </Button>
                <Link href={"/master-calendar" as never} className={buttonVariants()}>
                  View Master Calendar
                </Link>
              </>
            }
          />
        </div>
      ) : error ? (
        <div className="rounded-md border border-border bg-card">
          <ErrorState size="page" title="Couldn't load the PA script" message={error} onRetry={() => void loadData()} />
        </div>
      ) : null}

      <ConfirmDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        title="Regenerate the PA script?"
        description="This replaces the shared script and any unsaved edits with a new script using the latest announcements and assigned names. The result is saved for your PA team."
        confirmLabel="Regenerate script"
        cancelLabel="Cancel"
        onConfirm={() => {
          void regenerateScript();
        }}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={(open) => {
          setDiscardOpen(open);
          if (!open) setPendingHref(null);
        }}
        title={pendingHref ? "Leave without saving?" : "Discard your changes?"}
        description="Your unsaved edits will be removed. The saved script will stay unchanged."
        confirmLabel={pendingHref ? "Discard and leave" : "Discard changes"}
        cancelLabel="Keep editing"
        onConfirm={() => {
          setContent(data?.script?.content ?? "");
          setSaved(false);
          setActionError(null);
          if (pendingHref) router.push(pendingHref as never);
        }}
      />
    </div>
  );
}
