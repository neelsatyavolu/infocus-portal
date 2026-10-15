import { LoadingRegion, PageHeaderSkeleton } from "@/components/kit/skeleton";
import { VaultPanelSkeleton } from "./vault-skeleton";

export default function Loading() {
  return (
    <LoadingRegion label="Loading passwords" className="space-y-5">
      <PageHeaderSkeleton actions={2} />
      <VaultPanelSkeleton />
    </LoadingRegion>
  );
}
