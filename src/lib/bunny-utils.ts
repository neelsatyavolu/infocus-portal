export function thumbnailFromPlaybackUrl(playbackUrl: string) {
  const [baseUrl, query] = playbackUrl.split("?");
  const thumbnailBase = baseUrl.replace("/playlist.m3u8", "/thumbnail.jpg");
  return query ? `${thumbnailBase}?${query}` : thumbnailBase;
}
