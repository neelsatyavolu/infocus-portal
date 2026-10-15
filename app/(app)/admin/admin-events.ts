/**
 * Tells the app shell how many access requests are waiting, so the "Admin Dashboard" sidebar
 * count updates right after Approve, Deny, Approve all or a reload, without its own fetch. The
 * shell listens by this exact name (PAGE_STATUS_EVENTS.accessRequests in src/lib/sidebar-nav.ts,
 * read by components/shell/use-nav-status.ts); tests/sidebar-nav.test.ts keeps the two equal.
 */
export const ACCESS_REQUESTS_CHANGED_EVENT = "infocus-access-requests-changed";

type AccessRequestsChangedDetail = { pending: number };

export function announceAccessRequests(pending: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AccessRequestsChangedDetail>(ACCESS_REQUESTS_CHANGED_EVENT, { detail: { pending } })
  );
}
