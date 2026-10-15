import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { StatusTag } from "@/components/kit/status-tag";
import { buttonVariants } from "@/components/ui/button";
import { MeetCallLoader } from "@/components/meetings/call/meet-call-loader";
import { CallPlate } from "@/components/meetings/call/status-plate";
import { EMBEDDED_APP_COOKIE } from "@/src/lib/embedded-app";
import { requireMeetingViewer } from "@/src/server/meetings-access";
import { resolveProducerSeriesMeetingId } from "@/src/server/meetings-schedule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meeting", robots: { index: false, follow: false } };

/** Permanent link for the recurring InFocus Producer Meeting. */
const PRODUCER_SERIES_SLUG = "producers";
/** WKWebView applicationNameForUserAgent in infocus-drive/ios (PortalWebController.userAgentSuffix). */
const IOS_APP_USER_AGENT = /\bInFocusiOSApp\//;

async function viewerOrRedirect() {
  const result = await requireMeetingViewer().then(
    (viewer) => ({ viewer }),
    (error: unknown) => ({ forbidden: error instanceof Error && error.message === "FORBIDDEN" })
  );
  if ("viewer" in result) return result.viewer;
  redirect(result.forbidden ? "/access-denied" : ("/sign-in" as never));
}

function NoProducerMeeting({ embedded }: { embedded: boolean }) {
  return (
    <CallPlate
      eyebrow="InFocus Producer Meeting"
      tag={<StatusTag tone="neutral">None scheduled</StatusTag>}
      title="No InFocus Producer Meeting scheduled"
      body="There isn't a live or upcoming one right now."
      actions={
        !embedded ? (
          <Link href={"/meetings" as never} className={buttonVariants({ variant: "outline" })}>
            Go to Meetings
          </Link>
        ) : undefined
      }
    />
  );
}

/** The iPhone app's web view: `?app=1`, its embedded cookie, or its user agent suffix. */
async function isEmbeddedApp(app: string | string[] | undefined) {
  if (app === "1") return true;
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return Boolean(cookieStore.get(EMBEDDED_APP_COOKIE)?.value) || IOS_APP_USER_AGENT.test(headerStore.get("user-agent") ?? "");
}

export default async function MeetPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ app?: string | string[] }>;
}) {
  const [{ id }, { app }] = await Promise.all([params, searchParams]);
  const viewer = await viewerOrRedirect();
  const embedded = await isEmbeddedApp(app);

  if (id === PRODUCER_SERIES_SLUG) {
    const meetingId = await resolveProducerSeriesMeetingId();
    if (!meetingId) return <NoProducerMeeting embedded={embedded} />;
    redirect(`/meet/${encodeURIComponent(meetingId)}${app === "1" ? "?app=1" : ""}` as never);
  }

  return <MeetCallLoader meetingId={id} userName={viewer.name} embedded={embedded} />;
}
