/** Small HTTP helpers: JSON responses, Origin allowlist and CORS. */

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  const merged = new Headers(headers);
  merged.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: merged });
}

export function errorResponse(status: number, message: string, headers?: HeadersInit): Response {
  return json({ error: message }, status, headers);
}

export function parseAllowedOrigins(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
}

/** The request's Origin when it is on the allowlist, else null (missing Origin is refused). */
export function allowedOrigin(request: Request, allowList: readonly string[]): string | null {
  const origin = request.headers.get("Origin");
  return origin && allowList.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

/** Copies a response with CORS headers added (upstream responses have immutable headers). */
export function withCors(response: Response, origin: string, body?: BodyInit | null): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  headers.delete("Set-Cookie");
  return new Response(body === undefined ? response.body : body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}
