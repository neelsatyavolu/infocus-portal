// Client-bundle stand-in for prisma-workers.ts (aliased in next.config.ts), so `pg` never ships to the browser.
export type WorkersRequest = { key: object; connectionString: string };

export function isWorkersRuntime() {
  return false;
}

export function workersRequest(): WorkersRequest | null {
  return null;
}

export function pgAdapter(): never {
  throw new Error("pgAdapter is server-only");
}
