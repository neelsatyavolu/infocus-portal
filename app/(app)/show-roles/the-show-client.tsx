"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarX2, Mic2, RotateCw, ScrollText, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { BackLink } from "@/components/kit/button-group";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { cn } from "@/src/lib/utils";
import { ShowConfirmBanner } from "./show-confirm-banner";
import { ShowDateStrip } from "./show-date-strip";
import { ShowEditSummaryCard } from "./show-edit-summary";
import {
  daysOutFrom,
  fallbackTitle,
  generatorHref,
  isShowDay,
  needsRolesConfirmation,
  overviewCacheKey,
  showHref,
  stripItems,
  whenLabel,
  type Overview
} from "./show-overview";
import { CastPanel, PackagesPanel, ShowRolesPanel, type SavingTarget } from "./show-panels";
import { GeneratorAppSkeleton, ShowSkeleton } from "./show-skeleton";

// Loaded only when a producer opens it; keeps upload/thumbnail code off the page.
const ShowUploadDialog = dynamic(
  () => import("./show-upload-dialog").then((mod) => mod.ShowUploadDialog),
  { ssr: false }
);

// The Show Roles Generator (src/show-roles) loads only in generator mode.
const ShowRolesGenerator = dynamic(() => import("@/src/show-roles/App"), {
  ssr: false,
  loading: () => <GeneratorAppSkeleton />
});

const LOAD_FALLBACK = "Could not load the show.";

const EYEBROW = (
  <>
    <Mic2 className="h-3 w-3" aria-hidden />
    The Show
  </>
);

type View = { key: string; overview: Overview };
/** A failed load and the address it was for, so it only shows while that show is the one asked for. */
type LoadError = { key: string; message: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function readData<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? fallback);
  return payload.data;
}

async function postJson(url: string, body: unknown, fallback: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? fallback);
}

async function randomizeAnchorsFor(date: string) {
  const response = await fetch(`/api/show-roles/anchors?date=${encodeURIComponent(date)}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { suggested?: string[] };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? "Could not suggest anchors.");
  const suggested = payload.data?.suggested ?? [];
  if (suggested.length === 0) throw new Error("No eligible anchors left this month.");
  await postJson("/api/show-roles/anchors", { date, names: suggested, source: "random" }, "Could not save anchors.");
}

function OverviewBody({ initial }: { initial: View | null }) {
  // Reminder emails link to a filmed show with ?date=; the show strip writes it too.
  const requestedDate = useSearchParams().get("date") ?? undefined;
  const viewKey = requestedDate ?? "";
  // The server's copy (page.tsx) is for the address the page opened on; the strip swaps the
  // address in place (no server render), so later shows load here as before.
  const [view, setView] = useState<View | null>(() => (initial?.key === viewKey ? initial : null));
  const [loading, setLoading] = useState(() => initial?.key !== viewKey);
  const serverCopyRef = useRef(initial?.key === viewKey ? initial : null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState<SavingTarget>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Bumped after a manual upload is scheduled, so the automatic-editing line re-reads its status.
  const [editRefresh, setEditRefresh] = useState(0);
  const requestRef = useRef(0);
  // The address on screen now, for saves that finish after someone picked another show.
  const viewKeyRef = useRef(viewKey);
  useEffect(() => {
    viewKeyRef.current = viewKey;
  }, [viewKey]);

  /**
   * `key` is the address the answer belongs to ("" = the next show). Only the newest request may
   * update the screen, so quick switches and a save's reload can't land out of order.
   */
  const load = useCallback(async ({ key, date, cached }: { key: string; date?: string; cached?: boolean }) => {
    const request = ++requestRef.current;
    // On first view of a show, show the last copy at once and refresh it quietly (src/lib/client-cache.ts).
    // Reloads after a save skip it so the pre-save copy never flashes back.
    const copy = cached ? cachedValue<Overview>(overviewCacheKey(date)) : undefined;
    if (copy) {
      setView({ key, overview: copy });
      setLoading(false);
    }
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      const next = await readData<Overview>(
        await fetch(`/api/show-roles/overview${query}`, { cache: "no-store" }),
        LOAD_FALLBACK
      );
      if (request !== requestRef.current) return;
      rememberValue(overviewCacheKey(next.date), next);
      // Keep the next-show copy current too, whichever address the save came from.
      if (key === "" || cachedValue<Overview>(overviewCacheKey())?.date === next.date) {
        rememberValue(overviewCacheKey(), next);
      }
      setView({ key, overview: next });
      setLoadError(null);
    } catch (error) {
      if (request === requestRef.current) throw error;
    }
  }, []);

  useEffect(() => {
    const serverCopy = serverCopyRef.current;
    serverCopyRef.current = null;
    if (serverCopy && serverCopy.key === (requestedDate ?? "")) {
      // Already fresh from the server: keep it as the last copy, like a load would.
      rememberValue(overviewCacheKey(serverCopy.overview.date), serverCopy.overview);
      if (serverCopy.key === "") rememberValue(overviewCacheKey(), serverCopy.overview);
      return;
    }
    let current = true;
    load({ key: requestedDate ?? "", date: requestedDate, cached: true })
      .catch((error: unknown) => {
        if (!current) return;
        const message = errorMessage(error, LOAD_FALLBACK);
        setLoadError({ key: requestedDate ?? "", message });
        toast.error(message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load, requestedDate]);

  async function retry() {
    setRetrying(true);
    try {
      await load({ key: viewKey, date: requestedDate });
    } catch (error) {
      const message = errorMessage(error, LOAD_FALLBACK);
      setLoadError({ key: viewKey, message });
      toast.error(message);
    } finally {
      setRetrying(false);
      setLoading(false);
    }
  }

  async function runSave(target: SavingTarget, work: (date: string) => Promise<void>, fallback: string, success?: string) {
    if (!view) return;
    const date = view.overview.date;
    setSaving(target);
    try {
      await work(date);
    } catch (error) {
      toast.error(errorMessage(error, fallback));
      setSaving(null);
      return;
    }
    if (success) toast.success(success);
    try {
      // If another show was picked meanwhile, its own load owns the screen.
      if (viewKeyRef.current === viewKey) await load({ key: viewKey, date });
    } catch (error) {
      toast.error(errorMessage(error, LOAD_FALLBACK));
    } finally {
      setSaving(null);
    }
  }

  if (!view) {
    if (loading) return <ShowSkeleton />;
    return (
      <div className="route-enter space-y-5">
        <PageHeader
          eyebrow={EYEBROW}
          title={fallbackTitle(requestedDate)}
        />
        {loadError ? (
          <ErrorState
            size="page"
            title="Couldn't load the show"
            message={loadError.message}
            busy={retrying}
            onRetry={() => void retry()}
          />
        ) : (
          <EmptyState
            size="page"
            icon={CalendarX2}
            title="No upcoming show found."
            description="Shows appear here once they're on the school calendar."
          />
        )}
      </div>
    );
  }

  const overview = view.overview;
  const switching = view.key !== viewKey;
  // Only the error for the show being opened now; an older one (another show, a quiet refresh) stays a toast.
  const switchError = switching && loadError?.key === viewKey ? loadError.message : null;
  const daysOut = daysOutFrom(overview.date, new Date());
  const showDay = isShowDay(overview, daysOut);
  const confirmDue = needsRolesConfirmation(overview, daysOut);
  const generatorLink = generatorHref(requestedDate);
  const strip = stripItems(overview, requestedDate ?? overview.date, new Date());
  // While another show loads, the old one dims and can't be edited.
  const dimmed = cn("transition-opacity", switching && "opacity-60");

  return (
    <div className="@container route-enter space-y-5">
      <div className={dimmed} inert={switching} aria-busy={switching || undefined}>
        <PageHeader
          eyebrow={EYEBROW}
          status={showDay ? undefined : <StatusTag tone="warning">No show this day</StatusTag>}
          title={overview.label}
          description={whenLabel(daysOut, showDay)}
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadOpen(true)}
              >
                <Upload aria-hidden />
                Upload show
              </Button>
              {/* The one filled button, unless the roles check below is due. */}
              <Link
                href={overview.teleprompterHref as never}
                className={buttonVariants({ variant: confirmDue ? "outline" : "default" })}
              >
                <ScrollText aria-hidden />
                {overview.teleprompterDocId ? "Open script" : "Create script"}
              </Link>
            </>
          }
        />
      </div>

      {/* Locked while a save runs: the saving state and its reload belong to the show on screen. */}
      {strip.length > 1 ? <ShowDateStrip items={strip} disabled={saving !== null} /> : null}

      {switchError ? (
        <Alert
          tone="danger"
          title="Couldn't load that show"
          action={
            <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={() => void retry()}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          }
        >
          {switchError}
        </Alert>
      ) : null}

      <div className={cn("space-y-5", dimmed)} inert={switching} aria-busy={switching || undefined}>
        {confirmDue ? (
          <ShowConfirmBanner
            busy={saving !== null}
            onConfirm={() =>
              void runSave(
                "confirm",
                (date) => postJson("/api/show-roles/confirm", { date }, "Could not confirm the roles."),
                "Could not confirm the roles.",
                "Roles confirmed."
              )
            }
          />
        ) : null}

        {/* Two columns from a 768px column; Packages spans both, its rows side by side. */}
        <div className="grid gap-5 @3xl:grid-cols-2">
          <CastPanel
            overview={overview}
            saving={saving}
            onShowManagerChange={(name) =>
              void runSave(
                "manager",
                (date) => postJson("/api/show-roles/show-manager", { date, name }, "Could not save show manager."),
                "Could not save show manager."
              )
            }
            onAnchorsChange={(names) =>
              void runSave(
                "anchors",
                (date) => postJson("/api/show-roles/anchors", { date, names, source: "manual" }, "Could not save anchors."),
                "Could not save anchors."
              )
            }
            onRandomize={() => void runSave("anchors", randomizeAnchorsFor, "Could not randomize anchors.")}
          />
          <ShowRolesPanel overview={overview} daysOut={daysOut} generatorLink={generatorLink} />
          <PackagesPanel
            packages={overview.packages}
            showSlots={daysOut >= 0 && showDay}
            className="@3xl:col-span-2"
          />
          <ShowEditSummaryCard showDate={overview.date} refreshKey={editRefresh} className="@3xl:col-span-2" />
        </div>
      </div>

      {uploadOpen ? (
        <ShowUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onScheduled={() => setEditRefresh((count) => count + 1)}
          showDate={overview.date}
          showLabel={overview.label}
        />
      ) : null}
    </div>
  );
}

export default function TheShowClient({ initial }: { initial: View | null }) {
  const params = useSearchParams();
  if (params.get("generator") === "1") {
    return (
      <div className="space-y-4">
        <BackLink href={showHref(params.get("date"))}>Back to The Show</BackLink>
        <ShowRolesGenerator />
      </div>
    );
  }
  return <OverviewBody initial={initial} />;
}
