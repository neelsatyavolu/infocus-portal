import type { Metadata } from "next";
import { getLiveAccess } from "@/src/server/live-access";
import { LiveDashboard } from "./live-dashboard";
import LivePinGate from "./live-pin-gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Livestream dashboard", robots: { index: false, follow: false } };

export default async function LiveDashboardPage() {
  const access = await getLiveAccess();
  if (access.kind === "none") return <LivePinGate signedIn={access.signedIn} />;
  return <LiveDashboard canRotateKey={access.kind === "user" && access.canManage} signedIn={access.kind === "user"} />;
}
