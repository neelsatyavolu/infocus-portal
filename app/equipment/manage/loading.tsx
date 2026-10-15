import { LoadingRegion, PageHeaderSkeleton, Skeleton, TableSkeleton, ToolbarSkeleton } from "@/components/kit/skeleton";
import { TAB_LIST_CLASS } from "@/components/kit/tab-styles";

/** Shown while the server checks Manage access: the page's own shape (header, tabs, Out table). */
export default function Loading() {
  return (
    <LoadingRegion label="Loading Manage" className="space-y-5">
      <PageHeaderSkeleton actions={1} />
      <div aria-hidden className={TAB_LIST_CLASS}>
        {["w-12", "w-20", "w-20", "w-16"].map((width, index) => (
          <span key={index} className="flex h-10 items-center">
            <Skeleton className={`h-3.5 ${width}`} />
          </span>
        ))}
      </div>
      <ToolbarSkeleton start={4} end={0} />
      <TableSkeleton rows={6} columns={["w-2/3", "w-16", "w-1/2", "w-10", "w-24", "w-12"]} />
    </LoadingRegion>
  );
}
