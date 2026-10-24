import crypto from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { buildProviderToken } from "@/src/lib/apns";
import { fetchCollegeVisits } from "@/src/lib/college-visits-sheet";
import { hashPassword, verifyPassword } from "@/src/lib/password-hash";
import { prisma } from "@/src/lib/prisma";
import { listAssistantDocs } from "@/src/server/assistant-docs";
import { readPublicFile } from "@/src/server/public-file";

export type RuntimeCheck = { ok: boolean; detail?: string };

const CHECK_FEED = "runtime-check";
const GZIP_BYTES = 20 * 1024 * 1024;
const PARALLEL_QUERIES = 12;
const REQUIRED_ENV = ["APP_AUTH_SECRET", "DRIVE_SERVICE_TOKEN", "INNGEST_SIGNING_KEY", "APNS_PRIVATE_KEY"];

export async function runCheck(check: () => Promise<string | void>): Promise<RuntimeCheck> {
  try {
    const detail = await check();
    return detail ? { ok: true, detail } : { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

class Rollback extends Error {}

const CHECKS: Record<string, () => Promise<string | void>> = {
  dbQuery: async () => `${await prisma.user.count()} users`,
  dbRaw: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  // More queries at once than a Worker's 6 connections: they must queue, not fail.
  dbParallel: async () => {
    await Promise.all(Array.from({ length: PARALLEL_QUERIES }, () => prisma.user.count()));
  },
  dbInteractiveTransaction: async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.count();
        await tx.newsFeedState.upsert({ where: { feed: CHECK_FEED }, update: { lastId: "x" }, create: { feed: CHECK_FEED, lastId: "x" } });
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    if (await prisma.newsFeedState.findUnique({ where: { feed: CHECK_FEED } })) throw new Error("the transaction did not roll back");
  },
  // The client-wide omit (src/lib/prisma.ts) must hold on every host.
  dbOmit: async () => {
    const row = await prisma.mediaVersion.findFirst();
    if (row && (row as Record<string, unknown>).imageBase64 !== undefined) throw new Error("omit is not applied");
  },
  scrypt: async () => {
    if (!(await verifyPassword(CHECK_FEED, await hashPassword(CHECK_FEED)))) throw new Error("scrypt mismatch");
  },
  aesGcm: async () => {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const sealed = Buffer.concat([cipher.update("ok", "utf8"), cipher.final()]);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(cipher.getAuthTag());
    if (Buffer.concat([decipher.update(sealed), decipher.final()]).toString() !== "ok") throw new Error("aes-256-gcm mismatch");
  },
  es256: async () => {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    if (buildProviderToken({ keyId: "K", teamId: "T", privateKey: pem }, Date.now()).split(".").length !== 3) throw new Error("bad token");
  },
  // The hourly backup gzips its dump in one call (src/server/hub-backup.ts).
  gzip: async () => {
    const input = Buffer.alloc(GZIP_BYTES, "a");
    if (gunzipSync(gzipSync(input)).length !== input.length) throw new Error("gzip mismatch");
  },
  assistantDocs: async () => `${listAssistantDocs("executive").length} docs`,
  publicFile: async () => `${(await readPublicFile("live/infocus-icon.png")).length} bytes`,
  env: async () => {
    const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
  },
  // A2 autofill reads college visits from Google Sheets; the sheet always has rows, so none means no access.
  googleSheets: async () => {
    const visits = await fetchCollegeVisits();
    if (visits.length === 0) throw new Error("no college visits read; is the Google service account set?");
    return `${visits.length} college visits`;
  },
  drive: async () => {
    const base = process.env.DRIVE_BASE_URL;
    if (!base) throw new Error("DRIVE_BASE_URL is not set");
    return `status ${(await fetch(base, { method: "HEAD", signal: AbortSignal.timeout(5000) })).status}`;
  }
};

/**
 * Exercises what differs between hosts (database driver, Node crypto and zlib, bundled files, env).
 * Read-only except for one transaction that always rolls back. Returns counts and statuses, never rows.
 */
export async function runRuntimeChecks(): Promise<Record<string, RuntimeCheck>> {
  const results: Record<string, RuntimeCheck> = {};
  for (const [name, check] of Object.entries(CHECKS)) results[name] = await runCheck(check);
  return results;
}
