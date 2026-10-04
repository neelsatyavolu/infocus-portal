"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { CalendarPlus, ChevronDown, Loader2, Lock, Video } from "lucide-react";
import { toast } from "sonner";
import { CopyTextButton } from "@/components/copy-text-button";
import { Button } from "@/components/ui/button";
import type { MeetingListResponse, MeetingSummary } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { ConfirmDialog } from "../confirm-dialog";
import { InvitesPanel } from "./invites-panel";
import { LiveBanner, PastList, UpcomingList } from "./meeting-rows";
import { MoveDialog } from "./move-dialog";
import { ScheduleDialog } from "./schedule-dialog";

const REFRESH_MS = 60_000;
const TICK_MS = 10_000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function MeetingsClient() {
  const router = useRouter();
  const [data, setData] = useState<MeetingListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [dialog, setDialog] = useState<"schedule" | "private-now" | null>(null);
  const [moving, setMoving] = useState<MeetingSummary | null>(null);
  const [cancelling, setCancelling] = useState<MeetingSummary | null>(null);
  const [startMenu, setStartMenu] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await meetingsApi.list());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, "Couldn't load meetings."));
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
    const refresh = setInterval(() => void load(), REFRESH_MS);
    // Join buttons enable on time without waiting for the next refresh.
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  async function startNow() {
    setStarting(true);
    try {
      const { meeting } = await meetingsApi.create({ title: "Quick meeting" });
      router.push(`/meet/${encodeURIComponent(meeting.id)}` as never);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't start a meeting."));
      setStarting(false);
    }
  }

  async function cancelMeeting(meeting: MeetingSummary) {
    try {
      await meetingsApi.patch(meeting.id, { status: "CANCELED" });
      toast.success("Meeting cancelled.");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't cancel the meeting."));
      throw err;
    }
  }

  const onCreated = (meeting: MeetingSummary) => {
    if (dialog === "private-now") {
      router.push(`/meet/${encodeURIComponent(meeting.id)}` as never);
      return;
    }
    toast.success("Meeting scheduled.");
    void load();
  };

  const permanentLink = origin ? `${origin}/meet/producers` : "";

  return (
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-8 pb-24">
      <section className="brand-hero-panel relative overflow-hidden border border-border px-4 py-4 md:px-5">
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Producers</div>
            <h1 className="display-md mt-1 text-foreground">Meetings</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Calls are end-to-end encrypted. Times are Pacific.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog("schedule")}>
              <CalendarPlus aria-hidden /> Schedule
            </Button>
            <div className="flex">
              <Button onClick={() => void startNow()} disabled={starting} className={data?.canCreateInviteOnly ? "rounded-r-none" : undefined}>
                {starting ? <Loader2 className="animate-spin" aria-hidden /> : <Video aria-hidden />}
                Start now
              </Button>
              {data?.canCreateInviteOnly ? (
                <Popover.Root open={startMenu} onOpenChange={setStartMenu}>
                  <Popover.Trigger asChild>
                    <Button aria-label="More ways to start" className="rounded-l-none border-l border-[var(--brand-fill-hover)] px-2">
                      <ChevronDown aria-hidden />
                    </Button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content align="end" sideOffset={6} className="z-50 w-56 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-1">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none"
                        onClick={() => {
                          setStartMenu(false);
                          setDialog("private-now");
                        }}
                      >
                        <Lock className="h-4 w-4" aria-hidden /> Start private meeting…
                      </button>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Permanent link" className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--ink-4)] bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Permanent link for the InFocus Producer Meeting</p>
          <p className="truncate font-mono text-xs text-[var(--ink-text)]">{permanentLink || "/meet/producers"}</p>
        </div>
        <CopyTextButton text={permanentLink} label="Copy link" />
      </section>

      {loadError ? (
        <p className="flex items-center gap-2 rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger" role="alert">
          {loadError}
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </p>
      ) : null}

      {!data && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading meetings…
        </p>
      ) : null}

      {data ? (
        <>
          <LiveBanner meetings={data.live} now={now} />
          <Section title="Upcoming">
            <UpcomingList meetings={data.upcoming} now={now} onMove={setMoving} onCancel={setCancelling} />
          </Section>
          <Section title="Past">
            <PastList meetings={data.past} />
          </Section>
        </>
      ) : null}

      <InvitesPanel />

      <ScheduleDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        mode={dialog ?? "schedule"}
        canCreateInviteOnly={Boolean(data?.canCreateInviteOnly)}
        onCreated={onCreated}
      />
      <MoveDialog meeting={moving} onOpenChange={(open) => !open && setMoving(null)} onMoved={() => void load()} />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`Cancel ${cancelling?.title ?? "meeting"}?`}
        description="Producers won't be able to join it. Calendar invites get an update."
        confirmLabel="Cancel meeting"
        onConfirm={() => (cancelling ? cancelMeeting(cancelling) : undefined)}
      />
    </div>
  );
}
