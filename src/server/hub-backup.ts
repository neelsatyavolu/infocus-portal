import { Client } from "pg";
import { workersRequest } from "@/src/lib/prisma-workers";

export const LATEST_BACKUP_KEY = "hub/latest.json";
export const BACKUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
/** R2 multipart parts: every part but the last must be the same size, and at least 5 MiB. */
export const BACKUP_PART_BYTES = 6 * 1024 * 1024;
/** Rows fetched per cursor round trip. Tables with base64/bytea columns go one row at a time (images reach ~13 MB). */
const DUMP_BATCH_ROWS = 200;
const DUMP_HEAVY_BATCH_ROWS = 1;
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

/** A streamed object write: chunks go up as they come, nothing is held whole in memory. */
export type BackupUpload = {
  write: (chunk: Uint8Array) => Promise<void>;
  complete: () => Promise<void>;
  abort: () => Promise<void>;
};

export type BackupStore = {
  list: () => Promise<BackupObject[]>;
  put: (key: string, body: Buffer | string, contentType?: string) => Promise<void>;
  delete: (keys: string[]) => Promise<void>;
  upload: (key: string, contentType: string) => BackupUpload;
};

/** Writes one piece of the SQL dump, in order. */
export type DumpWriter = (text: string) => Promise<void>;

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

export function sqlDumpHeader(at: Date): string {
  return [
    `-- InFocus Portal backup ${at.toISOString()}`,
    "-- Schema comes from Prisma migrations in the matching git revision.",
    "SET session_replication_role = replica;",
    "",
    ""
  ].join("\n");
}

export function sqlCopyStart(table: string, columns: string[]): string {
  return `COPY ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) FROM stdin WITH (FORMAT csv, HEADER true);\n${columns.join(",")}\n`;
}

export function sqlCopyRow(row: unknown[]): string {
  return `${row.map((cell) => csvEscape(cell)).join(",")}\n`;
}

export const SQL_COPY_END = "\\.\n\n";

export function sqlDumpFooter(sequences: DumpSequence[]): string {
  let text = "";
  for (const sequence of sequences) {
    const value = typeof sequence.lastValue === "number" ? sequence.lastValue : Number(sequence.lastValue);
    text += `SELECT setval('${quoteIdent(sequence.name)}', ${Number.isFinite(value) ? value : 1}, true);\n`;
  }
  if (sequences.length > 0) {
    text += "\n";
  }
  return `${text}SET session_replication_role = DEFAULT;\n`;
}

/** The whole dump as one string (tests and small tools); the backup itself streams the same pieces. */
export function buildSqlDump(input: { at: Date; tables: DumpTable[]; sequences: DumpSequence[] }): string {
  let sql = sqlDumpHeader(input.at);
  for (const table of input.tables) {
    if (table.name === "_prisma_migrations") {
      continue;
    }
    sql += sqlCopyStart(table.name, table.columns);
    for (const row of table.rows) {
      sql += sqlCopyRow(row);
    }
    sql += SQL_COPY_END;
  }
  return sql + sqlDumpFooter(input.sequences);
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

/**
 * Splits a byte stream into parts of exactly `partBytes` (the last one may be shorter), so memory
 * holds about one part at a time.
 */
export function createPartSplitter(partBytes: number, onPart: (part: Uint8Array) => Promise<void>) {
  let chunks: Uint8Array[] = [];
  let buffered = 0;
  const drain = () => {
    const all = new Uint8Array(buffered);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    chunks = [];
    buffered = 0;
    return all;
  };
  return {
    async push(chunk: Uint8Array) {
      chunks.push(chunk);
      buffered += chunk.length;
      while (buffered >= partBytes) {
        const all = drain();
        const rest = all.slice(partBytes);
        if (rest.length > 0) {
          chunks = [rest];
          buffered = rest.length;
        }
        await onPart(all.subarray(0, partBytes));
      }
    },
    /** What is left after the last full part. */
    rest() {
      return drain();
    }
  };
}

/** Gzips what `produce` writes straight into `upload`; returns the compressed byte count. */
async function gzipInto(
  upload: BackupUpload,
  produce: (write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>) => Promise<void>
) {
  const gzip = new CompressionStream("gzip");
  const writer = gzip.writable.getWriter();
  const reader = gzip.readable.getReader();
  let compressed = 0;
  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        compressed += value.length;
        await upload.write(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      throw error;
    }
  })();
  pump.catch(() => undefined);

  try {
    await produce(async (bytes) => {
      await writer.ready;
      await writer.write(bytes);
    });
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    await pump.catch(() => undefined);
    throw error;
  }
  await pump;
  return compressed;
}

export async function runHubBackup(opts: {
  now: Date;
  config: R2BackupConfig | null;
  dumpSql: (write: DumpWriter) => Promise<void>;
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
    const key = hubBackupDumpKey(opts.now);
    const upload = opts.store.upload(key, "application/gzip");
    const encoder = new TextEncoder();
    let uncompressed = 0;
    let bytes: number;
    try {
      bytes = await gzipInto(upload, (writeBytes) =>
        opts.dumpSql(async (text) => {
          const encoded = encoder.encode(text);
          uncompressed += encoded.length;
          if (uncompressed > MAX_UNCOMPRESSED_BYTES) {
            throw new Error("Uncompressed dump exceeds 50 MB");
          }
          await writeBytes(encoded);
        })
      );
      await upload.complete();
    } catch (error) {
      await upload.abort().catch(() => undefined);
      throw error;
    }

    const listed = await opts.store.list();
    const stale = objectsToDelete(listed, opts.now);
    if (stale.length > 0) {
      await opts.store.delete(stale);
    }

    await opts.store.put(
      LATEST_BACKUP_KEY,
      latestPayload({ ok: true, at, key, bytes, error: null }),
      "application/json"
    );

    return { ok: true, key, bytes };
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
  // Hyperdrive (Cloudflare Workers) is a local proxy that does its own TLS to the database.
  if (/localhost|127\.0\.0\.1|\.hyperdrive\.local/i.test(stripped)) {
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
  /** Set on Cloudflare Workers only, where a direct TCP+TLS client to the database is not available. */
  HYPERDRIVE_URL?: string;
  DIRECT_URL?: string;
  POSTGRES_URL_NON_POOLING?: string;
  DATABASE_URL?: string;
};

function envBackupUrls(): BackupDbEnv {
  return {
    HYPERDRIVE_URL: workersRequest()?.connectionString,
    DIRECT_URL: process.env.DIRECT_URL,
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
    DATABASE_URL: process.env.DATABASE_URL
  };
}

export function backupDatabaseUrls(source: BackupDbEnv = envBackupUrls()): string[] {
  const urls: string[] = [];
  for (const raw of [source.HYPERDRIVE_URL, source.DIRECT_URL, source.POSTGRES_URL_NON_POOLING, source.DATABASE_URL]) {
    const url = raw?.trim();
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

export async function collectPublicTableDumpFromEnv(
  write: DumpWriter,
  source: BackupDbEnv = envBackupUrls()
): Promise<void> {
  const urls = backupDatabaseUrls(source);
  if (urls.length === 0) {
    throw new Error("No database URL configured");
  }

  let wrote = false;
  const tracked: DumpWriter = (text) => {
    wrote = true;
    return write(text);
  };
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await collectPublicTableDump(url, tracked);
    } catch (error) {
      lastError = error;
      // Once part of the dump has gone out, another URL would repeat it.
      if (wrote || !isRetryableBackupDbError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Database dump failed");
}

/** Streams every public table through a cursor inside one REPEATABLE READ snapshot. */
export async function collectPublicTableDump(connectionString: string, write: DumpWriter): Promise<void> {
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

    await write(sqlDumpHeader(new Date()));
    for (const { table_name: name } of tables.rows) {
      if (name === "_prisma_migrations") {
        continue;
      }
      const columns = await client.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [name]
      );
      const columnNames = columns.rows.map((row) => row.column_name);
      await write(sqlCopyStart(name, columnNames));
      if (columnNames.length > 0) {
        const heavy = columns.rows.some((row) => row.data_type === "bytea" || /base64/i.test(row.column_name));
        await streamTableRows(client, name, columnNames, heavy ? DUMP_HEAVY_BATCH_ROWS : DUMP_BATCH_ROWS, write);
      }
      await write(SQL_COPY_END);
    }

    const sequences = await client.query<{ sequencename: string; last_value: string | number | null }>(
      `SELECT sequencename, last_value
       FROM pg_sequences
       WHERE schemaname = 'public'
       ORDER BY sequencename`
    );
    await client.query("COMMIT");

    await write(
      sqlDumpFooter(
        sequences.rows.map((row) => ({
          name: row.sequencename,
          lastValue: row.last_value ?? 1
        }))
      )
    );
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

async function streamTableRows(client: Client, table: string, columns: string[], batchRows: number, write: DumpWriter) {
  const cursor = "hub_backup_rows";
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`);
  for (;;) {
    const batch = await client.query<Record<string, unknown>>(`FETCH ${batchRows} FROM ${cursor}`);
    if (batch.rows.length > 0) {
      await write(batch.rows.map((row) => sqlCopyRow(columns.map((column) => row[column]))).join(""));
    }
    if (batch.rows.length < batchRows) break;
  }
  // On failure the caller's ROLLBACK drops the cursor.
  await client.query(`CLOSE ${cursor}`);
}

export function backupDatabaseUrl(): string {
  return backupDatabaseUrls()[0] ?? "";
}
