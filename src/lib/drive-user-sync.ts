/**
 * Keep InFocus Drive NAS users in sync with packages accounts.
 * Create-if-missing on add; delete the corresponding NAS user on remove
 * (Drive never touches its protected admin accounts).
 */

function driveBaseUrl(): string {
  return (process.env.DRIVE_BASE_URL || "https://drive.infocuspaly.com").replace(/\/$/, "");
}

function serviceToken(): string {
  return process.env.DRIVE_SERVICE_TOKEN || "";
}

export type NasProvisionEntry = { email: string; name?: string | null };

export async function provisionNasUsers(entries: NasProvisionEntry[]): Promise<void> {
  const token = serviceToken();
  const users = entries
    .map((entry) => ({
      email: (entry.email || "").trim().toLowerCase(),
      name: (entry.name || "").trim()
    }))
    .filter((entry) => entry.email.includes("@"));
  if (!token || users.length === 0) {
    return;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(`${driveBaseUrl()}/api/service/ensure-user`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ users }),
      signal: ac.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`NAS user provision failed: ${res.status} ${text.slice(0, 300)}`);
    }
  } catch (error) {
    console.error("NAS user provision error", error);
  } finally {
    clearTimeout(timer);
  }
}

async function drivePost(path: string, body: unknown): Promise<void> {
  const token = serviceToken();
  if (!token) {
    return;
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(`${driveBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`NAS Drive ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    }
  } catch (error) {
    console.error(`NAS Drive ${path} error`, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function revokeNasUsers(emails: string[]): Promise<void> {
  const users = emails
    .map((email) => (email || "").trim().toLowerCase())
    .filter((email) => email.includes("@"))
    .map((email) => ({ email }));
  if (users.length === 0) {
    return;
  }
  await drivePost("/api/service/revoke-user", { users });
}
