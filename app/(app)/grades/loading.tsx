import { LoadingRegion, PageHeaderSkeleton } from "@/components/kit/skeleton";
import { GradesOverviewSkeleton, GradesTabsSkeleton } from "@/components/grades/grades-skeleton";

/** Same shape as the Grades Overview (tabs, plate, grade band, panels), so arriving doesn't jump. */
export default function Loading() {
  return (
    <LoadingRegion label="Loading grades" className="space-y-5">
      <GradesTabsSkeleton />
      <PageHeaderSkeleton actions={0} />
      <GradesOverviewSkeleton />
    </LoadingRegion>
  );
}
