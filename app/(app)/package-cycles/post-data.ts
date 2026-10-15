/** POSTs JSON and returns the `data` of the Portal's `ok()` envelope, or throws its error message. */
export async function postData<T>(url: string, body: unknown, fallback: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? fallback);
  }
  return payload.data;
}
