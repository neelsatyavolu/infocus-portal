import crypto from "node:crypto";

// Plain fetch instead of googleapis: on Workers, googleapis sends through node-fetch over node:http,
// and Sheets reads stopped working when the Portal moved there.
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const ASSERTION_LIFETIME_SECONDS = 3600;
const REQUEST_TIMEOUT_MS = 15_000;

export type GoogleServiceAccount = {
  email: string;
  privateKey: string;
};

/** RS256 JWT a service account trades for an access token. */
export function buildServiceAccountAssertion(account: GoogleServiceAccount, nowMs: number) {
  const issuedAt = Math.floor(nowMs / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: account.email,
      scope: READONLY_SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + ASSERTION_LIFETIME_SECONDS
    })
  ).toString("base64url");
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), account.privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

async function googleErrorMessage(response: Response) {
  const body = await response.json().catch(() => null);
  const error = body?.error;
  if (typeof error === "string") {
    return typeof body.error_description === "string" ? `${error}: ${body.error_description}` : error;
  }
  return typeof error?.message === "string" ? error.message : "no details";
}

async function accessToken(account: GoogleServiceAccount) {
  let assertion: string;
  try {
    assertion = buildServiceAccountAssertion(account, Date.now());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY could not sign (${reason}).`);
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`Google service account sign-in failed (HTTP ${response.status}): ${await googleErrorMessage(response)}`);
  }

  const body = await response.json();
  if (typeof body.access_token !== "string") {
    throw new Error("Google service account sign-in returned no token.");
  }
  return body.access_token as string;
}

async function readSheets(account: GoogleServiceAccount, url: URL) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken(account)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`Google Sheets read failed (HTTP ${response.status}): ${await googleErrorMessage(response)}`);
  }
  return response.json();
}

export async function fetchSheetTitles(account: GoogleServiceAccount, spreadsheetId: string): Promise<string[]> {
  const url = new URL(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets.properties.title");
  const body = (await readSheets(account, url)) as { sheets?: { properties?: { title?: string } }[] };
  return (body.sheets ?? []).map((sheet) => sheet.properties?.title ?? "");
}

/** Rows of each range, in the order asked for. */
export async function batchGetSheetValues(
  account: GoogleServiceAccount,
  spreadsheetId: string,
  ranges: string[]
): Promise<unknown[][][]> {
  const url = new URL(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet`);
  for (const range of ranges) {
    url.searchParams.append("ranges", range);
  }
  const body = (await readSheets(account, url)) as { valueRanges?: { values?: unknown[][] }[] };
  return ranges.map((_, index) => body.valueRanges?.[index]?.values ?? []);
}
