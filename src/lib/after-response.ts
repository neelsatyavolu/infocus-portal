import { after } from "next/server";

/**
 * Runs `task` after the response has been sent, so the person doesn't wait for emails, push,
 * Slack or syncs. On Workers, Next's `after()` becomes the request's `ctx.waitUntil` (OpenNext),
 * so the work isn't cut off the way a bare `void promise` can be, and it still uses this
 * request's database client. Failures are logged, never thrown. Outside a request (scripts,
 * tests without a request scope) the task just starts.
 */
export function afterResponse(label: string, task: () => Promise<unknown>) {
  const run = () =>
    task().catch((error) => {
      console.error(`${label} failed`, error);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
