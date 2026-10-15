import { ROW_CONTROL } from "@/components/announcements/sizes";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";

/**
 * The shared announcements list while it loads, in the list's own layout (SubmittedAnnouncementList):
 * sections 24px apart, a 40px header row with Copy all at its real height, then cards two-up from a
 * 48rem container.
 */
export function AnnouncementListSkeleton() {
  return (
    <LoadingRegion label="Loading submitted announcements" className="space-y-6">
      {[2, 1].map((cards, section) => (
        <div key={section}>
          <div className="flex min-h-10 items-center justify-between gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className={cn(ROW_CONTROL, "w-24 rounded-md")} />
          </div>
          <div className="@container mt-3">
            <div className="grid gap-3 @3xl:grid-cols-2">
              {Array.from({ length: cards }, (_, index) => (
                <Skeleton key={index} className="h-24 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}
