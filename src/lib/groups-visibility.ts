import type { PackageCategory, PlatformRole } from "@prisma/client";

type GroupVisibilityRow = {
  assignedProducerUserId?: string | null;
  assignedExecutiveProducerUserId?: string | null;
  category?: PackageCategory | null;
};

/**
 * Groups roster filter. Executive producers, the adviser, and super-admin
 * always see every package. Associates only see groups assigned to them
 * (or their category when a group has no assigned AP).
 */
export function filterGroupsForViewer<T extends GroupVisibilityRow>(
  rows: T[],
  viewer: {
    platformRole: PlatformRole | null;
    currentUserId: string;
    producerCategory: PackageCategory | null;
  }
): T[] {
  if (viewer.platformRole !== "ASSOCIATE_PRODUCER") {
    return rows;
  }

  return rows.filter((row) => {
    if (row.assignedProducerUserId) {
      return row.assignedProducerUserId === viewer.currentUserId;
    }
    if (viewer.producerCategory) {
      return !row.category || row.category === viewer.producerCategory;
    }
    return true;
  });
}

export function isGroupAssignedToViewer<
  T extends {
    assignedProducerUserId?: string | null;
    assignedExecutiveProducerUserId?: string | null;
  }
>(row: T, currentUserId: string) {
  return (
    row.assignedProducerUserId === currentUserId ||
    row.assignedExecutiveProducerUserId === currentUserId
  );
}

type PrimaryGroupRow = {
  assignedProducerUserId?: string | null;
  assignedExecutiveProducerUserId?: string | null;
  approvalStage?: string | null;
};

/**
 * Groups tiles: assigned packages stay expanded. Execs, super-admin, and the
 * adviser also keep Initial Cut Stage 3 and Final Cut out of Other groups.
 * The adviser also keeps Stage 2 (adviser review) expanded.
 */
export function isPrimaryGroupForViewer(
  row: PrimaryGroupRow,
  viewer: { currentUserId: string; platformRole: PlatformRole | null }
) {
  if (isGroupAssignedToViewer(row, viewer.currentUserId)) return true;

  const role = viewer.platformRole;
  if (role !== "EXECUTIVE_PRODUCER" && role !== "SUPER_ADMIN" && role !== "ADVISER") {
    return false;
  }
  if (row.approvalStage === "EXECUTIVE_REVIEW" || row.approvalStage === "APPROVED") {
    return true;
  }
  return role === "ADVISER" && row.approvalStage === "ADVISER_REVIEW";
}
