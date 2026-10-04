/**
 * Optional Cloudflare Realtime usage meter. When CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_TOKEN
 * are set, new LIVE starts are refused once month-to-date SFU egress passes 900 GB (free tier: 1 TB).
 * Not configured, or the lookup fails: allowed.
 */

export const MEETING_EGRESS_LIMIT_BYTES = 900 * 1000 ** 3;
const CACHE_MS = 10 * 60 * 1000;
const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

export const MEETING_USAGE_LIMIT_MESSAGE =
  "Meetings are paused for the rest of the month: the free video allowance is almost used up. Ask an executive producer.";

let cached: { at: number; bytes: number } | null = null;

const QUERY = `query MeetingEgress($accountTag: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      callsUsageAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
        sum { egressBytes }
      }
    }
  }
}`;

type EgressResponse = {
  data?: { viewer?: { accounts?: { callsUsageAdaptiveGroups?: { sum?: { egressBytes?: number } }[] }[] } };
  errors?: { message: string }[];
};

async function monthToDateEgressBytes(now: Date, accountId: string, token: string) {
  const start = `${now.toISOString().slice(0, 8)}01`;
  const end = now.toISOString().slice(0, 10);
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { accountTag: accountId, start, end } }),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Cloudflare analytics returned ${response.status}`);
  const body = (await response.json()) as EgressResponse;
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
  const groups = body.data?.viewer?.accounts?.[0]?.callsUsageAdaptiveGroups ?? [];
  return groups.reduce((total, group) => total + (group.sum?.egressBytes ?? 0), 0);
}

export async function checkMeetingUsage(now = new Date()): Promise<"allowed" | "over"> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN?.trim();
  if (!accountId || !token) return "allowed";

  try {
    if (!cached || now.getTime() - cached.at > CACHE_MS) {
      cached = { at: now.getTime(), bytes: await monthToDateEgressBytes(now, accountId, token) };
    }
    return cached.bytes > MEETING_EGRESS_LIMIT_BYTES ? "over" : "allowed";
  } catch (error) {
    console.error("Meeting usage meter failed", error instanceof Error ? error.message : error);
    return "allowed";
  }
}
