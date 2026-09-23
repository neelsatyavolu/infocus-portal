import { gzipSync } from "node:zlib";
import { Client } from "pg";

export const LATEST_BACKUP_KEY = "hub/latest.json";
export const BACKUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const HUB_BACKUP_DUMP_KEY = /^hub\/\d{4}-\d{2}-\d{2}T\d{4}Z\.sql\.gz$/;

export type R2BackupConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type BackupObject = {
  key: string;
  lastModified: Date;
  bytes: number;
};

export type LatestBackupStatus = {
  ok: boolean;
  at: string;
  key: string | null;
  bytes: number | null;
  error: string | null;
};

export type DumpTable = {
  name: string;
  columns: string[];
  rows: unknown[][];
};

export type DumpSequence = {
  name: string;
  lastValue: string | number;
};

export type BackupStore = {
  list: () => Promise<BackupObject[]>;
  put: (key: string, body: Buffer | string, contentType?: string) => Promise<void>;
  delete: (keys: string[]) => Promise<void>;
};

export type HubBackupResult =
  | { ok: false; skipped: true; reason: "not_configured" }
  | { ok: true; skipped?: false; key: string; bytes: number }
  | { ok: false; skipped?: false; error: string };

type R2Env = {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
};

export function hubBackupDumpKey(at: Date): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  const hour = String(at.getUTCHours()).padStart(2, "0");
  const minute = String(at.getUTCMinutes()).padStart(2, "0");
  return `hub/${year}-${month}-${day}T${hour}${minute}Z.sql.gz`;
}

export function isHubBackupDumpKey(key: string): boolean {
  return HUB_BACKUP_DUMP_KEY.test(key);
}

export function parseDumpKeyTime(key: string): Date | null {
  const match = /^hub\/(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z\.sql\.gz$/.exec(key);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`);
}

export function objectsToDelete(objects: BackupObject[], now: Date): string[] {
  const cutoff = now.getTime() - BACKUP_RETENTION_MS;
  return objects
    .filter((object) => {
      if (!object.key.endsWith(".sql.gz") || !isHubBackupDumpKey(object.key)) {
        return false;
      }
      const keyTime = parseDumpKeyTime(object.key);
      const lastModifiedOld = object.lastModified.getTime() < cutoff;
      const keyOld = keyTime ? keyTime.getTime() < cutoff : false;
      return lastModifiedOld || keyOld;
    })
    .map((object) => object.key);
}

export function parseLatestJson(raw: unknown): LatestBackupStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.ok !== "boolean" || typeof value.at !== "string") return null;
  if (value.key !== null && typeof value.key !== "string") return null;
  if (value.bytes !== null && typeof value.bytes !== "number") return null;
  if (value.error !== null && typeof value.error !== "string") return null;
  return {
    ok: value.ok,
    at: value.at,
    key: value.key,
    bytes: value.bytes,
    error: value.error
  };
}

export function isR2Configured(env: R2Env): boolean {
  return Boolean(r2ConfigFromEnv(env));
}

export function r2ConfigFromEnv(env: R2Env): R2BackupConfig | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let text: string;
  if (typeof value === "boolean") {
    text = value ? "t" : "f";
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else if (Buffer.isBuffer(value)) {
    text = `\\x${value.toString("hex")}`;
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  if (/[",\n\r\\]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function buildSqlDump(input: { at: Date; tables: DumpTable[]; sequences: DumpSequence[] }): string {
  const lines: string[] = [
    `-- InFocus Portal backup ${input.at.toISOString()}`,
    "-- Schema comes from Prisma migrations in the matching git revision.",
    "SET session_replication_role = replica;",
    ""
  ];

  for (const table of input.tables) {
    if (table.name === "_prisma_migrations") {
      continue;
    }
    const quotedTable = quoteIdent(table.name);
    const quotedCols = table.columns.map(quoteIdent).join(", ");
    lines.push(`COPY ${quotedTable} (${quotedCols}) FROM stdin WITH (FORMAT csv, HEADER true);`);
    lines.push(table.columns.join(","));
    for (const row of table.rows) {
      lines.push(row.map((cell) => csvEscape(cell)).join(","));
    }
    lines.push("\\.");
    lines.push("");
  }

  for (const sequence of input.sequences) {
    const value = typeof sequence.lastValue === "number" ? sequence.lastValue : Number(sequence.lastValue);
    lines.push(`SELECT setval('${quoteIdent(sequence.name)}', ${Number.isFinite(value) ? value : 1}, true);`);
  }

  if (input.sequences.length > 0) {
    lines.push("");
  }
  lines.push("SET session_replication_role = DEFAULT;");
  lines.push("");
  return lines.join("\n");
}

export function sanitizeBackupError(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgres://***@")
    .replace(/\b(password|secret|access[_-]?key)=[^\s&]+/gi, "$1=***")
    .slice(0, 300);
}

function latestPayload(input: LatestBackupStatus): Buffer {
  return Buffer.from(`${JSON.stringify(input)}\n`, "utf8");
}

export async function runHubBackup(opts: {
  now: Date;
  config: R2BackupConfig | null;
  dumpSql: () => Promise<string>;
  store: BackupStore;
}): Promise<HubBackupResult> {
  if (!opts.config) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const at = opts.now.toISOString();
  const writeFailure = async (error: string) => {
    const safe = sanitizeBackupError(error);
    try {
      await opts.store.put(
        LATEST_BACKUP_KEY,
        latestPayload({ ok: false, at, key: null, bytes: null, error: safe }),
        "application/json"
      );
    } catch {
      // Listing still works even if status write fails.
    }
    return { ok: false as const, error: safe };
  };

  try {
    const sql = await opts.dumpSql();
    if (Buffer.byteLength(sql, "utf8") > MAX_UNCOMPRESSED_BYTES) {
      return writeFailure("Uncompressed dump exceeds 50 MB");
    }

    const gzipped = gzipSync(Buffer.from(sql, "utf8"));
    const key = hubBackupDumpKey(opts.now);
    await opts.store.put(key, gzipped, "application/gzip");

    const listed = await opts.store.list();
    const stale = objectsToDelete(listed, opts.now);
    if (stale.length > 0) {
      await opts.store.delete(stale);
    }

    await opts.store.put(
      LATEST_BACKUP_KEY,
      latestPayload({ ok: true, at, key, bytes: gzipped.length, error: null }),
      "application/json"
    );

    return { ok: true, key, bytes: gzipped.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup failed";
    return writeFailure(message);
  }
}

const RETRYABLE_DB_CODES = new Set(["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED"]);

export function pgDumpClientOptions(connectionString: string): {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
} {
  const stripped = stripQueryParams(connectionString, ["sslmode", "ssl"]);
  if (/localhost|127\.0\.0\.1/i.test(stripped)) {
    return { connectionString: stripped };
  }
  return { connectionString: stripped, ssl: { rejectUnauthorized: false } };
}

function stripQueryParams(url: string, names: string[]): string {
  const question = url.indexOf("?");
  if (question < 0) return url;
  const base = url.slice(0, question);
  const kept = url
    .slice(question + 1)
    .split("&")
    .filter((part) => {
      const key = part.split("=", 1)[0]?.toLowerCase();
      return Boolean(key) && !names.includes(key);
    });
  return kept.length > 0 ? `${base}?${kept.join("&")}` : base;
}

export function isRetryableBackupDbError(error: unknown): boolean {
  const codes = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (!value || depth > 5) return;
    if (typeof value !== "object") return;
    const record = value as { code?: unknown; cause?: unknown; errors?: unknown[] };
    if (typeof record.code === "string") codes.add(record.code);
    if (record.cause) walk(record.cause, depth + 1);
    if (Array.isArray(record.errors)) {
      for (const inner of record.errors) walk(inner, depth + 1);
    }
  };
  walk(error, 0);
  if ([...codes].some((code) => RETRYABLE_DB_CODES.has(code))) {
    return true;
  }
  return (
    error instanceof Error &&
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|self-signed certificate|certificate/i.test(error.message)
  );
}

type BackupDbEnv = {
  DIRECT_URL?: string;
  POSTGRES_URL_NON_POOLING?: string;
  DATABASE_URL?: string;
};

function envBackupUrls(): BackupDbEnv {
  return {
    DIRECT_URL: process.env.DIRECT_URL,
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
    DATABASE_URL: process.env.DATABASE_URL
  };
}

export function backupDatabaseUrls(source: BackupDbEnv = envBackupUrls()): string[] {
  const urls: string[] = [];
  for (const raw of [source.DIRECT_URL, source.POSTGRES_URL_NON_POOLING, source.DATABASE_URL]) {
    const url = raw?.trim();
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

export async function collectPublicTableDumpFromEnv(source: BackupDbEnv = envBackupUrls()): Promise<string> {
  const urls = backupDatabaseUrls(source);
  if (urls.length === 0) {
    throw new Error("No database URL configured");
  }

  let lastError: unknown;
  for (const url of urls) {
    try {
      return await collectPublicTableDump(url);
    } catch (error) {
      lastError = error;
      if (!isRetryableBackupDbError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Database dump failed");
}

export async function collectPublicTableDump(connectionString: string): Promise<string> {
  const client = new Client(pgDumpClientOptions(connectionString));
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );

    const dumpTables: DumpTable[] = [];
    for (const { table_name: name } of tables.rows) {
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [name]
      );
      const columnNames = columns.rows.map((row) => row.column_name);
      if (columnNames.length === 0) {
        dumpTables.push({ name, columns: [], rows: [] });
        continue;
      }
      const quotedCols = columnNames.map(quoteIdent).join(", ");
      const result = await client.query(`SELECT ${quotedCols} FROM ${quoteIdent(name)}`);
      dumpTables.push({
        name,
        columns: columnNames,
        rows: result.rows.map((row) => columnNames.map((column) => row[column]))
      });
    }

    const sequences = await client.query<{ sequencename: string; last_value: string | number | null }>(
      `SELECT sequencename, last_value
       FROM pg_sequences
       WHERE schemaname = 'public'
       ORDER BY sequencename`
    );
    await client.query("COMMIT");

    return buildSqlDump({
      at: new Date(),
      tables: dumpTables,
      sequences: sequences.rows.map((row) => ({
        name: row.sequencename,
        lastValue: row.last_value ?? 1
      }))
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

export function backupDatabaseUrl(): string {
  return backupDatabaseUrls()[0] ?? "";
}
