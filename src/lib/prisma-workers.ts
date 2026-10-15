import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaPg } from "@prisma/adapter-pg";

type HyperdriveEnv = { HYPERDRIVE?: { connectionString: string } };

export type WorkersRequest = { key: object; connectionString: string };

export function isWorkersRuntime() {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/**
 * The current Cloudflare Workers request (its ExecutionContext is the key) and the Hyperdrive
 * connection string for it, or null on any other host.
 */
export function workersRequest(): WorkersRequest | null {
  if (!isWorkersRuntime()) return null;
  const { env, ctx } = getCloudflareContext();
  const connectionString = (env as HyperdriveEnv).HYPERDRIVE?.connectionString;
  if (!connectionString) throw new Error("HYPERDRIVE binding is missing");
  return { key: ctx, connectionString };
}

/**
 * Stays under the Workers limit of 6 outbound connections at once; Hyperdrive does the real pooling.
 * Keep `maxUses: 1` (OpenNext's recommended setup): a socket must never outlive its request, and
 * Workers hang when a pooled socket is reused (prisma/prisma#28193). Opening a socket to Hyperdrive
 * is cheap, so dropping it saves little.
 */
export function pgAdapter(connectionString: string) {
  return new PrismaPg({ connectionString, max: 5, maxUses: 1 });
}
