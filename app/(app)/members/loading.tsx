import { LoadingRegion, PageHeaderSkeleton } from "@/components/kit/skeleton";
import { MembersBodySkeleton } from "./members-skeleton";

export default function MembersLoading() {
  return (
    <LoadingRegion label="Loading members" className="space-y-5">
      <PageHeaderSkeleton actions={2} />
      <MembersBodySkeleton />
    </LoadingRegion>
  );
}
