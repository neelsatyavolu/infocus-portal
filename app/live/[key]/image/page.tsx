import type { Metadata } from "next";
import { LiveOverlay } from "@/components/live/live-overlay";

export const metadata: Metadata = { title: { absolute: "Live image · InFocus Live" }, robots: { index: false, follow: false } };

export default async function LiveImageOverlayPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <LiveOverlay overlayKey={key} kind="image" />;
}
