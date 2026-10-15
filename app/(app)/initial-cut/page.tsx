import type { Metadata } from "next";
import { StageWorkspace } from "@/components/package-cycle/stage-workspace";

export const metadata: Metadata = { title: "Initial Cut" };

// The shell owns the page width (one content column with the stage bar), so no wrapper here.
export default function InitialCutPage() {
  return <StageWorkspace slug="initial-cut" />;
}
