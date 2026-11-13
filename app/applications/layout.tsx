import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApplicationsShell } from "@/components/applications/applications-shell";
import { mainOriginForHost, normalizeHost } from "@/src/lib/hosts";
import { getApplicationsViewer } from "@/src/server/applications/access";

export const metadata: Metadata = { title: { default: "Applications", template: "%s · InFocus Applications" } };
export const dynamic = "force-dynamic";

/** The Applicant Portal (applications.<domain>). Middleware already sent signed-out people to sign in. */
export default async function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const host = headerStore.get("x-infocus-host") ?? headerStore.get("host");
  const mainOrigin = mainOriginForHost(host).replace(/\/$/, "");
  const viewer = await getApplicationsViewer().catch((error: unknown) => {
    if (!(error instanceof Error)) throw error;
    if (error.message === "FORBIDDEN") redirect("/access-denied" as never);
    // Sign in on the main host (Google's redirect lives there), then come back here.
    if (error.message === "UNAUTHORIZED") redirect(`${mainOrigin}/sign-in?returnTo=${encodeURIComponent(`https://${normalizeHost(host)}/`)}` as never);
    throw error;
  });
  const portalUrl = `${mainOrigin}/dashboard`;
  return (
    <ApplicationsShell portalUrl={portalUrl} isReviewer={viewer.isReviewer}>
      {children}
    </ApplicationsShell>
  );
}
