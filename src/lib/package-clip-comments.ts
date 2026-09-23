const CLIP_MARK = /^\[\[clip:([^\]]+)\]\]\n?/;

export function wrapClipComment(mediaItemId: string, body: string) {
  return `[[clip:${mediaItemId}]]\n${body}`;
}

export function parseClipComment(body: string): { mediaItemId: string | null; text: string } {
  const match = (body || "").match(CLIP_MARK);
  if (!match) {
    return { mediaItemId: null, text: body };
  }
  return { mediaItemId: match[1], text: body.slice(match[0].length) };
}
