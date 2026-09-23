import { env } from "@/src/lib/env";
import {
  collectPublicTableDumpFromEnv,
  r2ConfigFromEnv,
  runHubBackup,
  type HubBackupResult
} from "@/src/server/hub-backup";
import { createR2Store } from "@/src/server/hub-backup-r2";

export function currentR2Config() {
  return r2ConfigFromEnv({
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.R2_BUCKET
  });
}

export async function runConfiguredHubBackup(): Promise<HubBackupResult> {
  const config = currentR2Config();
  if (!config) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  return runHubBackup({
    now: new Date(),
    config,
    dumpSql: () => collectPublicTableDumpFromEnv(),
    store: createR2Store(config)
  });
}
