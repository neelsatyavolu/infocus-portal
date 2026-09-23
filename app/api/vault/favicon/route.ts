import { handleRouteError } from "@/src/lib/api-errors";
import { fail } from "@/src/lib/http";
import { requireVaultActor } from "@/src/server/password-vault";

/** Public hostnames only (no IPs, no single-label hosts like localhost). */
const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_ICON_BYTES = 100_000;
/** Raster only: an SVG served from our origin could run script if opened directly. */
const ICON_TYPES = ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/jpeg", "image/gif", "image/webp"];

/**
 * Site icon for a vault entry. The upstream is fixed (Google's favicon
 * service), so the host parameter cannot point the server anywhere else,
 * and viewers' browsers never contact a third party directly.
 */
export async function GET(request: Request) {
  try {
    await requireVaultActor();
    const host = new URL(request.url).searchParams.get("host")?.trim().toLowerCase() ?? "";
    if (!HOST_PATTERN.test(host)) throw new Error("BAD_REQUEST");

    const upstream = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
      { signal: AbortSignal.timeout(4000), next: { revalidate: 60 * 60 * 24 * 7 } }
    );
    const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!upstream.ok || !ICON_TYPES.includes(type)) return fail("Not found", 404);

    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_ICON_BYTES) return fail("Not found", 404);

    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
