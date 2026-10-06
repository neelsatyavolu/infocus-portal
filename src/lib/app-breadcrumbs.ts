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

/** Breadcrumb labels that differ from the title-cased slug, so crumbs match the sidebar. */
export const SEGMENT_LABELS: Record<string, string> = {
  "a-roll": "A-roll/B-roll",
  admin: "Admin Dashboard",
  livestreams: "Livestream Tracker",
  "package-cycles": "Cycle Dates",
  "package-progress": "Package Cycle",
  pa: "PA",
  "show-roles": "The Show",
  "social-media": "Instagram Post Maker"
};

/** Parent routes that have their own page, so their crumb can link back to it. */
const LINKABLE_PARENT_ROUTES = new Set(["/announcements", "/managers", "/meetings", "/publishing-queue"]);

/** Database ids (cuid) and other long tokens with digits are not readable labels. */
export function isIdSegment(segment: string) {
  return /^c[a-z0-9]{20,}$/i.test(segment) || (segment.length > 20 && /\d/.test(segment));
}

export function segmentLabel(segment: string) {
  if (isIdSegment(segment)) {
    return "Details";
  }
  return SEGMENT_LABELS[segment] ?? formatSegmentLabel(segment);
}

/** Fallback crumbs for routes without their own builder: one crumb per path segment. */
export function buildGenericBreadcrumbs(segments: string[]): AppBreadcrumb[] {
  if (segments.length === 0) {
    return [{ label: "Dashboard" }];
  }

  return segments.map((segment, index) => {
    const path = `/${segments.slice(0, index + 1).join("/")}`;
    const isLast = index === segments.length - 1;
    return !isLast && LINKABLE_PARENT_ROUTES.has(path)
      ? { label: segmentLabel(segment), href: path }
      : { label: segmentLabel(segment) };
  });
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
    crumbs.push({ label: segmentLabel(segments[2]) });
  }

  return crumbs;
}
