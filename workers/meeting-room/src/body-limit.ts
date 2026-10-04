/** Reads a request body as text with a hard byte cap, without buffering more than the cap. */

export const MAX_BODY_BYTES = 256 * 1024;

export type BodyRead = { ok: true; text: string } | { ok: false; status: 400 | 413 };

export async function readLimitedBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<BodyRead> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0) return { ok: false, status: 400 };
    if (length > maxBytes) return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset);
    return offset + chunk.byteLength;
  }, 0);
  return { ok: true, text: new TextDecoder().decode(bytes) };
}
