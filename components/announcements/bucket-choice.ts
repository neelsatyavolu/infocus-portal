import type { FilterChipOption } from "@/components/kit/filter-chips";
import {
  SUBMITTED_ANNOUNCEMENT_BUCKETS,
  type SubmittedAnnouncementBucketId
} from "@/src/lib/announcement-submission";

/** The Submitted section filter: one section, or all of them. */
export type BucketChoice = SubmittedAnnouncementBucketId | "all";

const BUCKET_CHOICES = new Set<string>(["all", ...SUBMITTED_ANNOUNCEMENT_BUCKETS.map((bucket) => bucket.id)]);

export function isBucketChoice(value: string): value is BucketChoice {
  return BUCKET_CHOICES.has(value);
}

type BucketSummary = { id: SubmittedAnnouncementBucketId; title: string; entries: readonly unknown[] };

/** The remembered section, or All when that section is empty today (the choice itself is kept). */
export function activeBucketChoice(choice: BucketChoice, buckets: readonly BucketSummary[]): BucketChoice {
  return choice !== "all" && buckets.some((bucket) => bucket.id === choice) ? choice : "all";
}

/** All plus one chip per non-empty section, each with its count; none when there is only one section. */
export function bucketChips(buckets: readonly BucketSummary[], total: number): Array<FilterChipOption<BucketChoice>> {
  if (buckets.length < 2) return [];
  return [
    { value: "all", label: "All", count: total },
    ...buckets.map((bucket) => ({ value: bucket.id, label: bucket.title, count: bucket.entries.length }))
  ];
}
