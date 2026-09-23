export async function vaultRequest<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body)
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "Request failed.");
  }
  return payload.data;
}

export type RevealedTotp = { field: "totp"; code: string; secondsRemaining: number; period: number };
export type RevealedValue = { field: "password" | "notes"; value: string };

export function revealVaultValue(entryId: string, field: "password" | "notes") {
  return vaultRequest<RevealedValue>(`/api/vault/${entryId}/reveal`, { method: "POST", body: { field } });
}

export function revealVaultTotp(entryId: string) {
  return vaultRequest<RevealedTotp>(`/api/vault/${entryId}/reveal`, { method: "POST", body: { field: "totp" } });
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}
