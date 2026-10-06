import type { Metadata } from "next";

export const metadata: Metadata = { title: "PA announcements" };

export default function PaAnnouncementLayout({ children }: { children: React.ReactNode }) {
  return children;
}
