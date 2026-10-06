import type { Metadata } from "next";
import { LiveOverlay } from "@/components/live/live-overlay";

export const metadata: Metadata = { title: { absolute: "Scoreboard · InFocus Live" }, robots: { index: false, follow: false } };

export default async function ScoreboardOverlayPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <LiveOverlay overlayKey={key} kind="scoreboard" />;
}
