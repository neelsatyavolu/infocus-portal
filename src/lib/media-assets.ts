export const IMAGE_BUNNY_LIBRARY_SENTINEL = "image";

export function buildMediaVersionImageUrl(mediaId: string, versionId: string, guestToken?: string | null) {
  const baseUrl = `/api/media/${mediaId}/versions/${versionId}/image`;
  if (!guestToken) {
    return baseUrl;
  }

  const encodedToken = encodeURIComponent(guestToken);
  return `${baseUrl}?guestToken=${encodedToken}`;
}
