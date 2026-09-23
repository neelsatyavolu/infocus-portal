const REVIEW_MARK = /^\[\[review:([^\]:]+):([^\]:]+)(?::([^\]]+))?\]\]\n?/;

export function wrapReviewNotice(
  target: { projectId: string; mediaId: string; versionId?: string | null },
  body: string
) {
  const version = target.versionId ? `:${target.versionId}` : "";
  return `[[review:${target.projectId}:${target.mediaId}${version}]]\n${body}`;
}

export function parseReviewNotice(body: string): {
  projectId: string | null;
  mediaId: string | null;
  versionId: string | null;
  text: string;
} {
  const match = (body || "").match(REVIEW_MARK);
  if (!match) {
    return { projectId: null, mediaId: null, versionId: null, text: body };
  }
  return {
    projectId: match[1] ?? null,
    mediaId: match[2] ?? null,
    versionId: match[3] ?? null,
    text: body.slice(match[0].length)
  };
}

export function buildReviewHref(projectId: string, mediaId: string, versionId?: string | null) {
  const params = new URLSearchParams({ bare: "1" });
  if (versionId) params.set("version", versionId);
  return `/projects/${projectId}/review/${mediaId}?${params.toString()}`;
}

export function isReviewNoticeText(text: string) {
  return /submitted a review/i.test(text);
}

export function reviewNoticeHref(input: {
  body: string;
  authorId: string;
  createdAt: string | Date;
  fallback?: { projectId: string; mediaId: string; versionId?: string | null } | null;
  events?: Array<{ mediaVersionId: string; changedById: string | null; createdAt: Date }>;
}): string | null {
  const parsed = parseReviewNotice(input.body);
  if (parsed.projectId && parsed.mediaId) {
    return buildReviewHref(parsed.projectId, parsed.mediaId, parsed.versionId);
  }
  if (!isReviewNoticeText(parsed.text)) return null;
  if (!input.fallback?.projectId || !input.fallback.mediaId) return null;

  const created = new Date(input.createdAt).getTime();
  const match = (input.events ?? [])
    .filter((event) => event.changedById === input.authorId)
    .sort(
      (left, right) =>
        Math.abs(left.createdAt.getTime() - created) - Math.abs(right.createdAt.getTime() - created)
    )[0];

  return buildReviewHref(
    input.fallback.projectId,
    input.fallback.mediaId,
    match?.mediaVersionId ?? input.fallback.versionId
  );
}
