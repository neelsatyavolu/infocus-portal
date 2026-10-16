export type ApiPayload<T> = { data?: T; error?: { message?: string } };

/**
 * Master Calendar saves. With `retryAfterMs`, a request with no answer by then is cancelled and
 * sent once more, and so is one that fails on the network. Saves were seen stuck at Cloudflare's
 * edge for 25 s or more before reaching the Worker (Oct 16, 2026), while a normal save answers in
 * under a second. Only for saves that set a value, so sending one twice stores the same thing.
 * Cancelling also stops the stuck copy at the edge, so it can't land later over a newer save.
 * An answer from the server, even an error, is never retried. Without `retryAfterMs` (slow
 * work like the Google Doc sync) it waits as long as it takes.
 */
export async function postJson<T>(url: string, body: unknown, options: { retryAfterMs?: number } = {}) {
  const send = (signal?: AbortSignal) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });

  let response: Response;
  if (options.retryAfterMs === undefined) {
    response = await send();
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.retryAfterMs);
    try {
      response = await send(controller.signal);
    } catch {
      // Stuck past the wait, or failed on the network: one more try, with no time limit.
      response = await send();
    } finally {
      clearTimeout(timer);
    }
  }

  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  return { response, payload };
}
