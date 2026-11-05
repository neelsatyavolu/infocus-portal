"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { submittedAirCounts, submittedAirCountsLine } from "@/components/announcements/air-counts";
import { SubmittedSectionsSkeleton } from "@/components/announcements/announcements-skeletons";
import {
  activeBucketChoice,
  bucketChips,
  isBucketChoice,
  type BucketChoice
} from "@/components/announcements/bucket-choice";
import { DeleteAnnouncementDialog } from "@/components/announcements/delete-announcement-dialog";
import { InviteDialog } from "@/components/announcements/invite-dialog";
import { SubmittedToolbar } from "@/components/announcements/submitted-toolbar";
import { useSessionChoice } from "@/components/announcements/use-session-choice";
import { Alert } from "@/components/kit/alert";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { SubmittedAnnouncementList } from "@/components/submitted-announcement-list";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import type { SubmittedAnnouncement } from "@/components/submitted-announcement-card";
import { groupSubmittedAnnouncements } from "@/src/lib/announcement-submission";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { COLLEGE_VISITS_SPREADSHEET_ID } from "@/src/lib/college-visits";

const COLLEGE_VISITS_URL = `https://docs.google.com/spreadsheets/d/${COLLEGE_VISITS_SPREADSHEET_ID}/edit?usp=sharing`;

const SUBMITTED_CACHE_KEY = "announcements-submitted";
/** Sections depend on today's date, so the chosen section is kept for this tab only. */
const BUCKET_CHOICE_KEY = "infocus:announcements:submitted:bucket";

type SubmittedAnnouncementsResponse = {
  announcements: SubmittedAnnouncement[];
  canDelete: boolean;
  meta: {
    source: "native" | "google-sheets" | "mixed";
    includedRows: number;
    skippedByCategory: number;
    retrievedAt: string;
  };
};

async function readData<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as {
    data?: T;
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load submitted announcements.");
  }

  return payload.data;
}

/** Drops entries deleted in this view, so a load that started before a delete can't bring one back. */
function withoutDeleted(data: SubmittedAnnouncementsResponse, deleted: ReadonlySet<string>) {
  if (deleted.size === 0) return data;
  return { ...data, announcements: data.announcements.filter((entry) => !deleted.has(entry.id)) };
}

function formatRetrievedAt(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** `canInvite` comes from the server page (executive producers can invite guest submitters). */
export default function SubmittedAnnouncementsClient({ canInvite }: { canInvite: boolean }) {
  // On first view, show the last copy at once and refresh it quietly (src/lib/client-cache.ts).
  const [data, setData] = useState<SubmittedAnnouncementsResponse | null>(
    () => cachedValue<SubmittedAnnouncementsResponse>(SUBMITTED_CACHE_KEY) ?? null
  );
  const [loading, setLoading] = useState(data === null);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<SubmittedAnnouncement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bucketChoice, setBucketChoice] = useSessionChoice<BucketChoice>(BUCKET_CHOICE_KEY, "all", isBucketChoice);
  const deletedIds = useRef<ReadonlySet<string>>(new Set());

  function fetchData(isRefresh: boolean) {
    return readData<SubmittedAnnouncementsResponse>("/api/announcements/submitted")
      .then((fresh) => setData(withoutDeleted(fresh, deletedIds.current)))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load submitted announcements."))
      .finally(() => {
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      });
  }

  async function loadData(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setMessage(null);
    await fetchData(isRefresh);
  }

  useEffect(() => {
    // `loading` and `message` already start where a first load would set them.
    void fetchData(false);
    // First view only; later loads come from Refresh.
  }, []);

  // Keep the tab cache in step with what's on screen (fresh loads and local deletes), so coming
  // back never flashes a deleted card.
  useEffect(() => {
    if (data) rememberValue(SUBMITTED_CACHE_KEY, data);
  }, [data]);

  /** Throws on failure so the confirm dialog stays open with the error. */
  async function deleteAnnouncement() {
    if (!deleteEntry || deletingId) return;
    const id = deleteEntry.id;
    setDeletingId(id);
    setDeleteError(null);
    try {
      const response = await fetch("/api/announcements/submitted", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not delete announcement.");
      }
      deletedIds.current = new Set([...deletedIds.current, id]);
      setData((current) => current ? {
        ...current,
        announcements: current.announcements.filter((entry) => entry.id !== id)
      } : current);
      setDeleteEntry(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete announcement.");
      throw error;
    } finally {
      setDeletingId(null);
    }
  }

  const announcements = useMemo(() => data?.announcements ?? [], [data]);
  const retrievedAt = formatRetrievedAt(data?.meta.retrievedAt);
  // The header says what goes out today and tomorrow, permanent entries included on show days;
  // the section chips count each section instead.
  const airCountsLine = useMemo(() => submittedAirCountsLine(submittedAirCounts(announcements)), [announcements]);
  const buckets = useMemo(() => groupSubmittedAnnouncements(announcements), [announcements]);
  const activeBucket = activeBucketChoice(bucketChoice, buckets);
  const chips = bucketChips(buckets, announcements.length);
  // Nothing on screen yet (first load, or a retry after a failed one).
  const showSkeleton = (loading || refreshing) && !data;

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Megaphone className="h-3 w-3" />
            From the public form
          </>
        }
        title="Submitted"
        description={
          data ? (
            <span className="tabular-nums">
              {airCountsLine}
              {retrievedAt ? ` · Updated ${retrievedAt}` : null}
            </span>
          ) : showSkeleton ? (
            <Skeleton className="h-4 w-40 max-w-full" />
          ) : null
        }
        actions={
          <Link href={"/submit-announcement" as never} className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            Submit
          </Link>
        }
      />

      <SubmittedToolbar
        chips={chips}
        chipValue={activeBucket}
        onChipChange={setBucketChoice}
        chipsLoading={showSkeleton}
        collegeVisitsUrl={COLLEGE_VISITS_URL}
        canInvite={canInvite}
        onInvite={() => setInviteOpen(true)}
        onRefresh={() => void loadData(true)}
        refreshing={refreshing}
        refreshDisabled={Boolean(deletingId)}
      />

      {/* With older data below it, a load failure is a warning; with nothing loaded it is the whole view. */}
      {message && data ? (
        <Alert tone="warning" role="alert">
          {message}
        </Alert>
      ) : null}

      {showSkeleton ? (
        <LoadingRegion label="Loading submitted announcements…">
          <SubmittedSectionsSkeleton />
        </LoadingRegion>
      ) : data ? (
        <SubmittedAnnouncementList
          announcements={announcements}
          bucket={activeBucket === "all" ? null : activeBucket}
          onDelete={data.canDelete ? (entry) => {
            setDeleteEntry(entry);
            setDeleteError(null);
          } : undefined}
          deletingId={deletingId}
          deleteDisabled={refreshing}
          empty={
            <div className="rounded-md border border-border bg-card">
              <EmptyState
                size="page"
                icon={Megaphone}
                title="No announcements have been submitted yet."
                description="Requests sent through the public form show up here."
                action={
                  <Link href={"/submit-announcement" as never} className={buttonVariants({ variant: "outline" })}>
                    Open the form
                  </Link>
                }
              />
            </div>
          }
        />
      ) : message ? (
        <div className="rounded-md border border-border bg-card">
          <ErrorState
            size="page"
            title="Couldn't load submitted announcements"
            message={message}
            onRetry={() => void loadData()}
          />
        </div>
      ) : null}

      <DeleteAnnouncementDialog
        entry={deleteEntry}
        error={deleteError}
        onClose={() => setDeleteEntry(null)}
        onConfirm={deleteAnnouncement}
      />

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
