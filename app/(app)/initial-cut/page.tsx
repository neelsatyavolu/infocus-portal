import type { Metadata } from "next";
import { StageWorkspace } from "@/components/package-cycle/stage-workspace";
import { loadStagePageView } from "@/src/server/stage-page-view";

export const metadata: Metadata = { title: "Initial Cut" };

// The shell owns the page width (one content column with the stage bar), so no wrapper here.
// The view is not awaited: it streams in, and StageWorkspace waits for it (under loading.tsx)
// only when it has no copy of this stage to show.
export default function InitialCutPage() {
  return <StageWorkspace slug="initial-cut" initialView={loadStagePageView({ slug: "initial-cut" })} />;
}
