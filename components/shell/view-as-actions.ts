/**
 * Switch the account the Portal shows (View as), or stop (userId null). On success the page
 * reloads on /grades as the new person; on failure it throws with the server's message.
 * Kept apart from the View as dialog so the in-page notice can stop without loading it.
 */
export async function switchViewAs(userId: string | null) {
  const response = await fetch("/api/auth/view-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  });
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Could not switch user.");
  }
  window.location.assign("/grades");
}

export function stopViewingAs() {
  return switchViewAs(null);
}
