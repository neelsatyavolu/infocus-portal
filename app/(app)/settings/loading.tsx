import { LoadingRegion, PageHeaderSkeleton, Skeleton } from "@/components/kit/skeleton";
import { SettingsGrid, SettingsPanel } from "@/components/settings-layout";
import { ChannelCardSkeleton, ChannelGrid } from "./channel-card";

const RAIL_WIDTHS = ["w-24", "w-36", "w-16", "w-28", "w-24"];

function SectionHeadSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3.5 w-72 max-w-full" />
    </div>
  );
}

/**
 * Settings while it loads: the plate, the section rail (a strip on phones), and the first panels.
 * The frame repeats SettingsLayout's classes (rendering SettingsLayout here would play its
 * entrance animation twice); the panels are the real SettingsPanel and SettingsGrid.
 */
export default function Loading() {
  return (
    <LoadingRegion label="Loading settings" className="w-full space-y-6 lg:space-y-8">
      <PageHeaderSkeleton actions={0} />
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
        <div aria-hidden className="mb-6 flex h-10 items-center gap-6 overflow-hidden border-b border-border px-3 lg:hidden">
          {RAIL_WIDTHS.map((width, index) => (
            <Skeleton key={index} className={`h-3.5 shrink-0 ${width}`} />
          ))}
        </div>
        <div aria-hidden className="hidden space-y-0.5 lg:block">
          {RAIL_WIDTHS.map((width, index) => (
            <div key={index} className="flex h-9 items-center border-l-2 border-transparent px-3">
              <Skeleton className={`h-3.5 ${width}`} />
            </div>
          ))}
        </div>
        <div className="@container min-w-0 space-y-10">
          <div className="space-y-4">
            <SectionHeadSkeleton />
            <ChannelGrid>
              <ChannelCardSkeleton />
              <ChannelCardSkeleton />
            </ChannelGrid>
          </div>
          <div className="space-y-4">
            <SectionHeadSkeleton />
            <SettingsPanel>
              <SettingsGrid>
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} aria-hidden className="flex min-h-16 items-center justify-between gap-4 px-4 py-4 md:px-5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-9 w-28 rounded-md" />
                  </div>
                ))}
              </SettingsGrid>
            </SettingsPanel>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
