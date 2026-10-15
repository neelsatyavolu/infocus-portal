import type { Metadata } from "next";
import { StageWorkspace } from "@/components/package-cycle/stage-workspace";

export const metadata: Metadata = { title: "Final Cut" };

// The shell owns the page width (one content column with the stage bar), so no wrapper here.
export default function FinalCutPage() {
  return <StageWorkspace slug="final-cut" />;
}
