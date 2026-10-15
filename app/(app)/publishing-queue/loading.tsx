import { PageHeaderSkeleton } from "@/components/kit/skeleton";
import { QueueSkeleton } from "./queue-skeleton";

/**
 * Shaped like the producers' queue (Managers, Past shows, Add package; three tiles; the rundown).
 * The role isn't known yet here; website managers, the rare case, see one action and two tiles
 * settle in.
 */
export default function PublishingQueueLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton actions={3} />
      <QueueSkeleton />
    </div>
  );
}
