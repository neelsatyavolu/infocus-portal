"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Megaphone, Plus, RefreshCcw, UserPlus } from "lucide-react";
import { SubmittedAnnouncementList } from "@/components/submitted-announcement-list";
import { Button } from "@/components/ui/button";
import { windowFor, type SubmittedAnnouncement } from "@/components/submitted-announcement-card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const INVITE_DURATIONS = [
  { value: "30d", label: "30 days" },
  { value: "1y", label: "1 year" }
] as const;

type InviteDuration = (typeof INVITE_DURATIONS)[number]["value"];

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

export default function SubmittedAnnouncementsPage() {
  const [data, setData] = useState<SubmittedAnnouncementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [canInvite, setCanInvite] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [inviteDuration, setInviteDuration] = useState<InviteDuration>("30d");
  const [deleteEntry, setDeleteEntry] = useState<SubmittedAnnouncement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadData(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setMessage(null);

    try {
      const nextData = await readData<SubmittedAnnouncementsResponse>("/api/announcements/submitted");
      setData(nextData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load submitted announcements.");
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadData();
    void fetch("/api/platform/me", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: { permissions?: { isExecutiveProducer?: boolean } };
        };
        setCanInvite(Boolean(payload.data?.permissions?.isExecutiveProducer));
      })
      .catch(() => {
        setCanInvite(false);
      });
  }, []);

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
      setData((current) => current ? {
        ...current,
        announcements: current.announcements.filter((entry) => entry.id !== id)
      } : current);
      setDeleteEntry(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete announcement.");
    } finally {
      setDeletingId(null);
    }
  }

  async function createInvite(sendEmail: boolean) {
    setInviteBusy(true);
    setInviteNote(null);
    try {
      const response = await fetch("/api/announcements/submitted/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: inviteEmails,
          sendEmail,
          duration: inviteDuration
        })
      });
      const payload = (await response.json()) as {
        data?: { shareUrl?: string; emailed?: number };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data?.shareUrl) {
        throw new Error(payload.error?.message ?? "Could not create invite.");
      }

      setInviteUrl(payload.data.shareUrl);
      if (sendEmail) {
        setInviteNote(
          payload.data.emailed
            ? `Sent ${payload.data.emailed} invite${payload.data.emailed === 1 ? "" : "s"}.`
            : "Link created. Email is not configured, so copy the link instead."
        );
      }
      return payload.data.shareUrl;
    } catch (error) {
      setInviteNote(error instanceof Error ? error.message : "Could not create invite.");
      return null;
    } finally {
      setInviteBusy(false);
    }
  }

  const retrievedAt = useMemo(() => {
    if (!data?.meta.retrievedAt) {
      return null;
    }

    const parsed = new Date(data.meta.retrievedAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }, [data?.meta.retrievedAt]);

  const announcements = data?.announcements ?? [];
  const airingToday = announcements.filter((entry) => windowFor(entry).airsToday);
  const airingTomorrow = announcements.filter((entry) => windowFor(entry).airsTomorrow && !windowFor(entry).airsToday);

  return (
    <div className="route-enter space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <Megaphone className="h-3 w-3" />
              InFocus submissions
            </div>
            <h1 className="display-md mt-2 text-foreground">Submitted</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Grouped by when they air. Copy one, or copy a whole section.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canInvite ? (
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(true);
                  setInviteNote(null);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </button>
            ) : null}
            <Link
              href={"/submit-announcement" as never}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-green)] px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--brand-green-deep)]"
            >
              <Plus className="h-4 w-4" />
              Submit
            </Link>
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing || Boolean(deletingId)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {message ? <p className="relative mt-3 text-sm text-amber-300">{message}</p> : null}

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <span className="meta-pill tabular-nums">{announcements.length} total</span>
          <span className="meta-pill tabular-nums">{airingToday.length} air today</span>
          <span className="meta-pill tabular-nums">{airingTomorrow.length} air tomorrow</span>
          {retrievedAt ? <span className="meta-pill">Updated {retrievedAt}</span> : null}
        </div>
      </section>

      <section className="space-y-2">
        {loading ? (
          <article className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Loading submitted announcements...
          </article>
        ) : (
          <SubmittedAnnouncementList
            announcements={announcements}
            onDelete={data?.canDelete && !refreshing ? (entry) => {
              setDeleteEntry(entry);
              setDeleteError(null);
            } : undefined}
            deletingId={deletingId}
            empty={
              <article className="rounded-2xl border border-dashed border-border bg-muted/50 p-6 text-sm text-muted-foreground">
                No announcements have been submitted yet.{" "}
                <Link href={"/submit-announcement" as never} className="underline underline-offset-2">
                  Open the form
                </Link>
                .
              </article>
            }
          />
        )}
      </section>

      <Dialog open={Boolean(deleteEntry)} onOpenChange={(open) => {
        if (!open && !deletingId) setDeleteEntry(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete announcement?</DialogTitle>
            <DialogDescription>
              This announcement will be removed from submissions and future scripts. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-sm">
            {deleteEntry?.announcement}
          </p>
          {deleteError ? <p role="alert" className="text-sm text-amber-300">{deleteError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={Boolean(deletingId)} onClick={() => setDeleteEntry(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={Boolean(deletingId)} onClick={() => void deleteAnnouncement()}>
              {deletingId ? "Deleting..." : "Delete announcement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite people to view submissions</DialogTitle>
            <DialogDescription>
              Send a link so people can see submitted announcements without signing in.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Link lasts</legend>
            <div className="grid grid-cols-2 gap-2">
              {INVITE_DURATIONS.map((option) => {
                const selected = inviteDuration === option.value;
                return (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium ${
                      selected
                        ? "border-[var(--brand-green)] bg-[var(--brand-green)]/10 text-foreground"
                        : "border-border bg-secondary text-muted-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="invite-duration"
                      value={option.value}
                      checked={selected}
                      onChange={() => setInviteDuration(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Email addresses</span>
            <textarea
              value={inviteEmails}
              onChange={(event) => setInviteEmails(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
              placeholder="name@pausd.org, another@pausd.org"
            />
          </label>
          {inviteUrl ? (
            <p className="break-all rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">{inviteUrl}</p>
          ) : null}
          {inviteNote ? <p className="text-sm text-amber-200">{inviteNote}</p> : null}
          <DialogFooter>
            <button
              type="button"
              disabled={inviteBusy}
              onClick={() => {
                void createInvite(false).then(async (url) => {
                  if (!url) {
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(url);
                    setInviteNote("Link copied.");
                  } catch {
                    setInviteNote("Link created. Copy it from the box above.");
                  }
                });
              }}
              className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-semibold text-foreground"
            >
              {inviteBusy ? "Working..." : "Copy link"}
            </button>
            <button
              type="button"
              disabled={inviteBusy || !inviteEmails.trim()}
              onClick={() => void createInvite(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Send invites
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
