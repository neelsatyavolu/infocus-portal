export type AppBreadcrumb = {
  label: string;
  href?: string;
};

type GroupBreadcrumbTopic = {
  rowId: string;
  topic: string;
};

let groupBreadcrumbTopic: GroupBreadcrumbTopic | null = null;
const groupBreadcrumbListeners = new Set<() => void>();

export function publishGroupBreadcrumbTopic(rowId: string, topic: string | null) {
  const next = topic?.trim() ? { rowId, topic: topic.trim() } : null;
  const same =
    (groupBreadcrumbTopic === null && next === null) ||
    (groupBreadcrumbTopic !== null &&
      next !== null &&
      groupBreadcrumbTopic.rowId === next.rowId &&
      groupBreadcrumbTopic.topic === next.topic);
  if (same) {
    return;
  }
  groupBreadcrumbTopic = next;
  for (const listener of groupBreadcrumbListeners) {
    listener();
  }
}

export function subscribeGroupBreadcrumbTopic(listener: () => void) {
  groupBreadcrumbListeners.add(listener);
  return () => {
    groupBreadcrumbListeners.delete(listener);
  };
}

export function getGroupBreadcrumbTopic() {
  return groupBreadcrumbTopic;
}

export function publishedGroupTopicForRow(
  published: GroupBreadcrumbTopic | null,
  rowId: string | undefined
) {
  if (!published || !rowId || published.rowId !== rowId) {
    return null;
  }
  return published.topic;
}

export function formatSegmentLabel(segment: string) {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildGroupsBreadcrumbs(segments: string[], groupTopic?: string | null): AppBreadcrumb[] | null {
  if (segments[0] !== "groups") {
    return null;
  }

  const crumbs: AppBreadcrumb[] = [
    { label: "Groups", href: segments.length > 1 ? "/groups" : undefined }
  ];

  const rowId = segments[1];
  if (!rowId) {
    return crumbs;
  }

  const topic = groupTopic?.trim();
  crumbs.push({
    label: topic || "Group",
    href: segments[2] ? `/groups/${rowId}` : undefined
  });

  if (segments[2]) {
    crumbs.push({ label: formatSegmentLabel(segments[2]) });
  }

  return crumbs;
}
