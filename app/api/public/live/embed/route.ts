import { homepagePlayerCsp, renderHomepagePlayerHtml } from "@/src/lib/homepage-player";

export const dynamic = "force-dynamic";

/** Embeddable homepage player for infocusnews.tv: latest show, or the live stream while one is on. */
export function GET() {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return new Response(renderHomepagePlayerHtml(nonce), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": homepagePlayerCsp(nonce),
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
