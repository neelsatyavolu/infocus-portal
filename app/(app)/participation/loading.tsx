import { LoadingRegion, PageHeaderSkeleton } from "@/components/kit/skeleton";
import { ParticipationToolbarSkeleton, ParticipationWeekSkeleton } from "./participation-skeleton";

export default function ParticipationLoading() {
  return (
    <LoadingRegion label="Loading participation" className="space-y-5">
      <PageHeaderSkeleton actions={0} />
      <ParticipationToolbarSkeleton />
      <ParticipationWeekSkeleton />
    </LoadingRegion>
  );
}
