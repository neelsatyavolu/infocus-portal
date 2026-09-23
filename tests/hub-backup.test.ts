import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({
  prisma: {}
}));

import { isPlatformSuperAdmin } from "@/src/lib/platform-admin";
import {
  BACKUP_RETENTION_MS,
  LATEST_BACKUP_KEY,
  buildSqlDump,
  csvEscape,
  hubBackupDumpKey,
  isHubBackupDumpKey,
  isR2Configured,
  objectsToDelete,
  parseLatestJson,
  quoteIdent,
  backupDatabaseUrls,
  isRetryableBackupDbError,
  pgDumpClientOptions,
  runHubBackup,
  sanitizeBackupError,
  type BackupObject,
  type BackupStore,
  type R2BackupConfig
} from "@/src/server/hub-backup";

describe("hub backup object keys", () => {
  it("formats a UTC dump key with zero-padded hour and minute", () => {
    expect(hubBackupDumpKey(new Date("2026-09-02T15:00:12.000Z"))).toBe("hub/2026-09-02T1500Z.sql.gz");
  });

  it("accepts dump keys and rejects latest.json and traversal", () => {
    expect(isHubBackupDumpKey("hub/2026-09-02T1500Z.sql.gz")).toBe(true);
    expect(isHubBackupDumpKey("hub/latest.json")).toBe(false);
    expect(isHubBackupDumpKey("hub/../secret.sql.gz")).toBe(false);
    expect(isHubBackupDumpKey("other/2026-09-02T1500Z.sql.gz")).toBe(false);
  });
});

describe("hub backup retention", () => {
  it("deletes sql.gz older than 7 days and never deletes latest.json", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const objects: BackupObject[] = [
      { key: LATEST_BACKUP_KEY, lastModified: new Date("2026-08-01T00:00:00.000Z"), bytes: 12 },
      { key: "hub/2026-09-09T1500Z.sql.gz", lastModified: new Date("2026-09-09T15:00:00.000Z"), bytes: 100 },
      { key: "hub/2026-09-04T0000Z.sql.gz", lastModified: new Date("2026-09-04T00:00:00.000Z"), bytes: 100 },
      { key: "hub/2026-09-02T1500Z.sql.gz", lastModified: new Date("2026-09-02T15:00:00.000Z"), bytes: 100 },
      { key: "hub/2026-08-01T0000Z.sql.gz", lastModified: new Date("2026-08-01T00:00:00.000Z"), bytes: 100 }
    ];

    expect(objectsToDelete(objects, now)).toEqual([
      "hub/2026-09-02T1500Z.sql.gz",
      "hub/2026-08-01T0000Z.sql.gz"
    ]);
    expect(BACKUP_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("latest.json", () => {
  it("parses success and failure shapes", () => {
    expect(
      parseLatestJson({
        ok: true,
        at: "2026-09-02T15:00:12.000Z",
        key: "hub/2026-09-02T1500Z.sql.gz",
        bytes: 12345,
        error: null
      })
    ).toEqual({
      ok: true,
      at: "2026-09-02T15:00:12.000Z",
      key: "hub/2026-09-02T1500Z.sql.gz",
      bytes: 12345,
      error: null
    });

    expect(parseLatestJson({ ok: false, at: "2026-09-02T15:00:12.000Z", key: null, bytes: null, error: "boom" })).toEqual({
      ok: false,
      at: "2026-09-02T15:00:12.000Z",
      key: null,
      bytes: null,
      error: "boom"
    });

    expect(parseLatestJson({ nope: true })).toBeNull();
  });
});

describe("r2 config and access", () => {
  it("requires all four r2 env values", () => {
    expect(isR2Configured({})).toBe(false);
    expect(
      isR2Configured({
        R2_ACCOUNT_ID: "acct",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET: "infocus-hub-backups"
      })
    ).toBe(true);
  });

  it("allows adviser and super admin, denies executive producer", () => {
    expect(isPlatformSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(isPlatformSuperAdmin("ADVISER")).toBe(true);
    expect(isPlatformSuperAdmin("EXECUTIVE_PRODUCER")).toBe(false);
  });
});

describe("sql dump", () => {
  it("quotes identifiers and escapes csv specials", () => {
    expect(quoteIdent("User")).toBe('"User"');
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
    expect(csvEscape("\\.")).toBe('"\\."');
  });

  it("builds COPY sql for public tables and skips _prisma_migrations", () => {
    const sql = buildSqlDump({
      at: new Date("2026-09-02T15:00:12.000Z"),
      tables: [
        {
          name: "_prisma_migrations",
          columns: ["id"],
          rows: [["skip-me"]]
        },
        {
          name: "User",
          columns: ["id", "email"],
          rows: [
            ["u1", "a@example.com"],
            ["u2", "b,quoted@example.com"]
          ]
        },
        {
          name: "Workspace",
          columns: ["id", "name"],
          rows: [["w1", "InFocus"]]
        }
      ],
      sequences: [{ name: "Workspace_id_seq", lastValue: 9 }]
    });

    expect(sql).toContain("-- InFocus Portal backup 2026-09-02T15:00:12.000Z");
    expect(sql).toContain("Prisma migrations");
    expect(sql).toContain("SET session_replication_role = replica;");
    expect(sql).toContain('COPY "User" ("id", "email") FROM stdin WITH (FORMAT csv, HEADER true);');
    expect(sql).toContain("id,email");
    expect(sql).toContain("u1,a@example.com");
    expect(sql).toContain('u2,"b,quoted@example.com"');
    expect(sql).toContain('COPY "Workspace" ("id", "name") FROM stdin WITH (FORMAT csv, HEADER true);');
    expect(sql).toContain("SELECT setval('\"Workspace_id_seq\"', 9, true);");
    expect(sql).toContain("SET session_replication_role = DEFAULT;");
    expect(sql).not.toContain("_prisma_migrations");
    expect(sql).not.toContain("skip-me");
    expect(sql).toMatch(/\\\.\n/);
  });
});

describe("runHubBackup", () => {
  const config: R2BackupConfig = {
    accountId: "acct",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucket: "infocus-hub-backups"
  };

  it("skips without throwing when r2 is not configured", async () => {
    const result = await runHubBackup({
      now: new Date("2026-09-02T15:00:12.000Z"),
      config: null,
      dumpSql: async () => {
        throw new Error("should not dump");
      },
      store: memoryStore()
    });
    expect(result).toEqual({ ok: false, skipped: true, reason: "not_configured" });
  });

  it("uploads gzip, writes latest.json, and prunes old dumps", async () => {
    const store = memoryStore([
      { key: "hub/2026-08-01T0000Z.sql.gz", lastModified: new Date("2026-08-01T00:00:00.000Z"), bytes: 10 }
    ]);
    const result = await runHubBackup({
      now: new Date("2026-09-02T15:00:12.000Z"),
      config,
      dumpSql: async () => "-- dump\n",
      store
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.key).toBe("hub/2026-09-02T1500Z.sql.gz");
    expect(result.bytes).toBeGreaterThan(0);
    expect(store.has("hub/2026-09-02T1500Z.sql.gz")).toBe(true);
    expect(store.has("hub/2026-08-01T0000Z.sql.gz")).toBe(false);
    expect(JSON.parse(store.text(LATEST_BACKUP_KEY))).toMatchObject({
      ok: true,
      key: "hub/2026-09-02T1500Z.sql.gz",
      error: null
    });
  });

  it("keeps existing dumps and records a safe error when dump fails", async () => {
    const store = memoryStore([
      { key: "hub/2026-09-02T1400Z.sql.gz", lastModified: new Date("2026-09-02T14:00:00.000Z"), bytes: 10, body: "old" }
    ]);
    const result = await runHubBackup({
      now: new Date("2026-09-02T15:00:12.000Z"),
      config,
      dumpSql: async () => {
        throw new Error("password=super-secret failed");
      },
      store
    });

    expect(result.ok).toBe(false);
    expect(store.has("hub/2026-09-02T1400Z.sql.gz")).toBe(true);
    const latest = JSON.parse(store.text(LATEST_BACKUP_KEY));
    expect(latest.ok).toBe(false);
    expect(latest.key).toBeNull();
    expect(latest.error).toContain("failed");
    expect(latest.error).not.toContain("super-secret");
  });

  it("fails clearly when uncompressed dump exceeds 50MB", async () => {
    const store = memoryStore();
    const result = await runHubBackup({
      now: new Date("2026-09-02T15:00:12.000Z"),
      config,
      dumpSql: async () => "x".repeat(50 * 1024 * 1024 + 1),
      store
    });
    expect(result.ok).toBe(false);
    expect(JSON.parse(store.text(LATEST_BACKUP_KEY)).error).toMatch(/50 MB/i);
  });
});

describe("backup database urls", () => {
  it("prefers DIRECT_URL then session pooler then DATABASE_URL", () => {
    expect(
      backupDatabaseUrls({
        DIRECT_URL: "postgres://direct",
        POSTGRES_URL_NON_POOLING: "postgres://session",
        DATABASE_URL: "postgres://pool"
      })
    ).toEqual(["postgres://direct", "postgres://session", "postgres://pool"]);
  });

  it("skips blanks and duplicates", () => {
    expect(
      backupDatabaseUrls({
        DIRECT_URL: "  ",
        POSTGRES_URL_NON_POOLING: "postgres://same",
        DATABASE_URL: "postgres://same"
      })
    ).toEqual(["postgres://same"]);
  });
});

describe("pg dump client options", () => {
  it("disables TLS verification and strips sslmode for hosted postgres", () => {
    const options = pgDumpClientOptions("postgres://user:pass@db.example/postgres?sslmode=require&pgbouncer=true");
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
    expect(options.connectionString).toBe("postgres://user:pass@db.example/postgres?pgbouncer=true");
    expect(options.connectionString).not.toMatch(/sslmode/i);
  });

  it("leaves localhost without an ssl override", () => {
    expect(pgDumpClientOptions("postgres://localhost/postgres").ssl).toBeUndefined();
  });
});

describe("retryable dump connection errors", () => {
  it("retries DNS failures like ENOTFOUND", () => {
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND db.example.supabase.co"), { code: "ENOTFOUND" });
    expect(isRetryableBackupDbError(error)).toBe(true);
    expect(isRetryableBackupDbError(new Error("self-signed certificate in certificate chain"))).toBe(true);
    expect(isRetryableBackupDbError(new Error("relation User does not exist"))).toBe(false);
  });
});

describe("sanitizeBackupError", () => {
  it("strips secrets from error text", () => {
    expect(sanitizeBackupError("postgresql://user:hunter2@db/postgres boom")).not.toContain("hunter2");
    expect(sanitizeBackupError("password=abc123")).not.toContain("abc123");
  });
});

function memoryStore(seed: Array<BackupObject & { body?: string | Buffer }> = []): BackupStore & {
  has: (key: string) => boolean;
  text: (key: string) => string;
} {
  const objects = new Map<string, { lastModified: Date; bytes: number; body: Buffer }>();
  for (const item of seed) {
    const body = Buffer.from(item.body ?? "");
    objects.set(item.key, { lastModified: item.lastModified, bytes: item.bytes || body.length, body });
  }

  return {
    async list() {
      return [...objects.entries()].map(([key, value]) => ({
        key,
        lastModified: value.lastModified,
        bytes: value.bytes
      }));
    },
    async put(key, body) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      objects.set(key, { lastModified: new Date(), bytes: buffer.length, body: buffer });
    },
    async delete(keys) {
      for (const key of keys) objects.delete(key);
    },
    has(key) {
      return objects.has(key);
    },
    text(key) {
      return objects.get(key)?.body.toString("utf8") ?? "";
    }
  };
}
