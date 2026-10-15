import { LoadingRegion, PageHeaderSkeleton, PanelSkeleton } from "@/components/kit/skeleton";
import { BoardColumns } from "../tab/board-columns";

/** The notes page while it loads: the plate, then Summary beside Details, in the page's real grid. */
export function NotesSkeleton() {
  return (
    <LoadingRegion label="Loading meeting notes…" className="space-y-5">
      <PageHeaderSkeleton actions={0} />
      <BoardColumns variant="reading" main={<PanelSkeleton rows={6} />} rail={<PanelSkeleton rows={4} />} />
    </LoadingRegion>
  );
}
