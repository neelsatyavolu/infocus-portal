import { LoadingRegion, PageHeaderSkeleton, ToolbarSkeleton } from "@/components/kit/skeleton";
import { RosterSkeleton } from "./roster-list";

/** Shaped like the roster: header plate, the toolbar (chips; mode, cycle, refresh), then the table rows. */
export default function PackageProgressLoading() {
  return (
    <LoadingRegion label="Loading the roster" className="space-y-5">
      <span className="sr-only">Loading the roster…</span>
      <PageHeaderSkeleton actions={2} />
      <ToolbarSkeleton start={3} end={3} />
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <RosterSkeleton />
      </div>
    </LoadingRegion>
  );
}
