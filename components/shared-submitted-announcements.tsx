"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Megaphone } from "lucide-react";
import { SubmittedAnnouncementList } from "@/components/submitted-announcement-list";
import type { SubmittedAnnouncement } from "@/components/submitted-announcement-card";

type ResponseShape = {
  announcements: SubmittedAnnouncement[];
};

export function SharedSubmittedAnnouncements() {
  const token = useSearchParams().get("token") ?? "";
  const [announcements, setAnnouncements] = useState<SubmittedAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) {
        setMessage("This invite link is missing a token.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/announcements/submitted/shared?token=${encodeURIComponent(token)}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { data?: ResponseShape; error?: { message?: string } };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Could not open this invite.");
        }
        if (!active) {
          return;
        }
        setAnnouncements(payload.data.announcements);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Could not open this invite.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative">
          <div className="eyebrow flex items-center gap-2">
            <Megaphone className="h-3 w-3" />
            InFocus
          </div>
          <h1 className="display-md mt-2 text-foreground">Submitted announcements</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Shared view of announcements requested for InFocus and Schoology.
          </p>
        </div>
      </section>

      {message ? <p className="text-sm text-amber-300">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading submitted announcements…</p>
      ) : (
        <SubmittedAnnouncementList
          announcements={announcements}
          hideEmail
          hideEnded
          empty={
            message ? null : (
              <p className="rounded-2xl border border-dashed border-border bg-muted/50 p-6 text-sm text-muted-foreground">
                No current announcements.
              </p>
            )
          }
        />
      )}
    </main>
  );
}
