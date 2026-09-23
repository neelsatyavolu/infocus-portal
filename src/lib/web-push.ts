import webpush from "web-push";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;

function ensureConfigured() {
  if (configured) {
    return true;
  }

  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getWebPushPublicKey() {
  return process.env.WEB_PUSH_PUBLIC_KEY ?? null;
}

export function isWebPushConfigured() {
  return ensureConfigured();
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: PushPayload
) {
  if (!ensureConfigured()) {
    return { ok: false as const, stale: false };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      },
      JSON.stringify(payload)
    );

    return { ok: true as const, stale: false };
  } catch (error: unknown) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;

    if (statusCode === 404 || statusCode === 410) {
      return { ok: false as const, stale: true };
    }

    return { ok: false as const, stale: false };
  }
}
