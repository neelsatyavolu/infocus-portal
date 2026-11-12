const ENDPOINT = "/api/show-roles/anchor-requests";

async function send(method, body, query = "") {
  const response = await fetch(`${ENDPOINT}${query}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Something went wrong. Try again.");
  }
  return payload?.data;
}

export function loadAnchorRequests(showDate) {
  return send("GET", null, showDate ? `?date=${encodeURIComponent(showDate)}` : "");
}

export function createAnchorRequest(input) {
  return send("POST", input);
}

export function updateAnchorRequest(id, action) {
  return send("PATCH", { id, action });
}
