import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { MeetCallLoader } from "@/components/meetings/call/meet-call-loader";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { resolveProducerSeriesMeetingId } from "@/src/server/meetings-schedule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meeting · InFocus Portal", robots: { index: false, follow: false } };

/** Permanent link for the recurring Producer meeting. */
const PRODUCER_SERIES_SLUG = "producers";

async function viewerOrRedirect() {
  const result = await requireMeetingViewer().then(
    (viewer) => ({ viewer }),
    (error: unknown) => ({ forbidden: error instanceof Error && error.message === "FORBIDDEN" })
  );
  if ("viewer" in result) return result.viewer;
  redirect(result.forbidden ? "/access-denied" : ("/sign-in" as never));
}

function NoProducerMeeting() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <section className="w-full max-w-md space-y-3 border border-[var(--ink-4)] bg-[var(--ink-2)] p-6">
        <div className="eyebrow">Producer meeting</div>
        <h1 className="display-sm text-foreground">No producer meeting scheduled</h1>
        <p className="text-sm text-[var(--ink-text)]">There isn&rsquo;t a live or upcoming producer meeting right now.</p>
        <Link href={"/meetings" as never} className={buttonVariants({ variant: "outline" })}>
          Go to Meetings
        </Link>
      </section>
    </main>
  );
}

export default async function MeetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerOrRedirect();

  if (id === PRODUCER_SERIES_SLUG) {
    const meetingId = await resolveProducerSeriesMeetingId();
    if (!meetingId) return <NoProducerMeeting />;
    redirect(`/meet/${encodeURIComponent(meetingId)}` as never);
  }

  return <MeetCallLoader meetingId={id} userName={viewer.name} />;
}
