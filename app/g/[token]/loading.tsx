import { Skeleton } from "@/components/kit/skeleton";
import { ReviewSkeleton } from "@/components/review/review-skeleton";

export default function GuestReviewLoading() {
  return (
    <main className="min-h-dvh p-4 md:p-6">
      <div aria-hidden className="mb-4 flex h-10 items-center gap-3">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3.5 w-20" />
      </div>
      <ReviewSkeleton guest />
    </main>
  );
}
