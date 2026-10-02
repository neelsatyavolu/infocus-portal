import crypto from "node:crypto";
import http2 from "node:http2";

/** Apple Push (APNs) for the InFocus Mac and iPhone apps. Token auth (.p8 key), HTTP/2, no dependency. */

export type ApnsEnvironment = "production" | "development";
/** `topic` is the receiving app's bundle ID: every app has its own. */
export type ApnsDevice = { token: string; environment: ApnsEnvironment; topic: string };
/** `data` adds custom top-level keys the app reads (e.g. `kind`, `videoId`). */
export type ApnsAlert = { title: string; body: string; url?: string; threadId?: string; data?: Record<string, string> };
export type ApnsApp = "macos" | "ios" | "news";
export type ApnsResult = { token: string; ok: boolean; dead: boolean; status?: number; reason?: string };

type ApnsConfig = { keyId: string; teamId: string; privateKey: string };

/** Bundle ID of each app, from env. An app without one gets no pushes. */
const TOPIC_ENV: Record<ApnsApp, string> = { macos: "APNS_TOPIC", ios: "APNS_IOS_TOPIC", news: "APNS_NEWS_TOPIC" };

const APNS_HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  development: "https://api.sandbox.push.apple.com"
};
/** Apple accepts a provider token for an hour and rejects refreshes more often than every 20 minutes. */
const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
/** Responses that mean the token will never work again. */
const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);

let cachedProviderToken: { value: string; keyId: string; createdAt: number } | null = null;

function readConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const rawKey = process.env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !rawKey) return null;
  return { keyId, teamId, privateKey: rawKey.replace(/\\n/g, "\n") };
}

export function apnsTopic(app: ApnsApp) {
  return process.env[TOPIC_ENV[app]]?.trim() || null;
}

/** The signing key is set and at least one app has a topic. */
export function isApnsConfigured() {
  return readConfig() !== null && (Object.keys(TOPIC_ENV) as ApnsApp[]).some((app) => apnsTopic(app) !== null);
}

/** ES256 JWT that authenticates this server to APNs. */
export function buildProviderToken(config: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">, nowMs: number) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(nowMs / 1000) })).toString("base64url");
  const signingInput = `${header}.${claims}`;
  const signature = crypto
    .sign("sha256", Buffer.from(signingInput), { key: config.privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

function providerToken(config: ApnsConfig) {
  const now = Date.now();
  if (
    !cachedProviderToken ||
    cachedProviderToken.keyId !== config.keyId ||
    now - cachedProviderToken.createdAt >= PROVIDER_TOKEN_TTL_MS
  ) {
    cachedProviderToken = { value: buildProviderToken(config, now), keyId: config.keyId, createdAt: now };
  }
  return cachedProviderToken.value;
}

export function buildApnsPayload(alert: ApnsAlert) {
  return JSON.stringify({
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: "default",
      ...(alert.threadId ? { "thread-id": alert.threadId } : {})
    },
    ...alert.data,
    ...(alert.url ? { url: alert.url } : {})
  });
}

function sendOne(
  session: http2.ClientHttp2Session,
  device: ApnsDevice,
  headers: http2.OutgoingHttpHeaders,
  body: string
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const request = session.request({
      ...headers,
      "apns-topic": device.topic,
      ":method": "POST",
      ":path": `/3/device/${device.token}`
    });
    let status: number | undefined;
    let responseBody = "";
    const finish = (result: Omit<ApnsResult, "token">) => resolve({ token: device.token, ...result });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.close(http2.constants.NGHTTP2_CANCEL);
      finish({ ok: false, dead: false, reason: "Timeout" });
    });
    request.on("response", (responseHeaders) => {
      status = Number(responseHeaders[":status"]);
    });
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      if (status === 200) return finish({ ok: true, dead: false, status });
      let reason: string | undefined;
      try {
        reason = (JSON.parse(responseBody) as { reason?: string }).reason;
      } catch {
        reason = undefined;
      }
      if (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken") cachedProviderToken = null;
      finish({ ok: false, dead: status === 410 || DEAD_TOKEN_REASONS.has(reason ?? ""), status, reason });
    });
    request.on("error", (error) => finish({ ok: false, dead: false, reason: error.message }));
    request.end(body);
  });
}

async function sendToHost(environment: ApnsEnvironment, devices: ApnsDevice[], config: ApnsConfig, body: string) {
  const session = http2.connect(APNS_HOSTS[environment]);
  // A connection error fails each pending request through its own "error" handler.
  session.on("error", () => undefined);
  try {
    const headers = {
      authorization: `bearer ${providerToken(config)}`,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json"
    };
    return await Promise.all(devices.map((device) => sendOne(session, device, headers, body)));
  } finally {
    session.close();
  }
}

/** Sends one alert to many devices. Never throws; each device gets a result. */
export async function sendApns(devices: ApnsDevice[], alert: ApnsAlert): Promise<ApnsResult[]> {
  const config = readConfig();
  if (!config || devices.length === 0) return [];
  const body = buildApnsPayload(alert);
  const byEnvironment = (["production", "development"] as const)
    .map((environment) => ({ environment, devices: devices.filter((device) => device.environment === environment) }))
    .filter((group) => group.devices.length > 0);

  const results = await Promise.all(
    byEnvironment.map(async (group) => {
      try {
        return await sendToHost(group.environment, group.devices, config, body);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "APNs request failed";
        return group.devices.map((device) => ({ token: device.token, ok: false, dead: false, reason }));
      }
    })
  );
  return results.flat();
}

/** Test hook: forget the cached provider token. */
export function resetApnsProviderTokenCache() {
  cachedProviderToken = null;
}
