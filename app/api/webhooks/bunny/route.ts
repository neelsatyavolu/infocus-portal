import { inngest } from "@/src/lib/inngest";
import {
  verifyBunnyWebhookLibrary,
  verifyBunnyWebhookQuerySecret,
  verifyBunnyWebhookSignature
} from "@/src/lib/bunny";
import { fail, ok } from "@/src/lib/http";

// Bunny Stream Status enum: 0=Queued, 1=Processing, 2=Encoding, 3=Finished, 4=ResolutionFinished, 5=Failed, 6=PresignedUploadStarted, 7=PresignedUploadFinished, 8=PresignedUploadFailed
// We only forward final-state transitions to Inngest so encoding-progress callbacks don't fan out into background work.
function isFinalState(payload: Record<string, unknown>): boolean {
  const raw = payload.status ?? payload.state ?? (payload as { Status?: unknown }).Status;
  if (typeof raw === "number") {
    return raw === 3 || raw === 4 || raw === 5 || raw === 8;
  }
  const str = `${raw ?? ""}`.toLowerCase();
  if (!str) return false;
  return (
    str.includes("ready") ||
    str.includes("finished") ||
    str.includes("complete") ||
    str.includes("fail") ||
    str.includes("error")
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const rawBody = await request.text();
  const signature = request.headers.get("Bunny-Signature") ?? request.headers.get("signature");

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return fail("Invalid JSON payload", 400);
  }

  if (!verifyBunnyWebhookLibrary(payload)) {
    return fail("Invalid webhook library", 401);
  }

  if (!verifyBunnyWebhookQuerySecret(url)) {
    return fail("Invalid webhook key", 401);
  }

  if (signature && !verifyBunnyWebhookSignature(rawBody, signature)) {
    return fail("Invalid webhook signature", 401);
  }

  if (!isFinalState(payload)) {
    return ok({ received: true, forwarded: false }, 202);
  }

  await inngest.send({
    name: "bunny/webhook.received",
    data: payload
  });

  return ok({ received: true, forwarded: true }, 202);
}
