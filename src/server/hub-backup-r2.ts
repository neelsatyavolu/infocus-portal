import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  type BackupObject,
  type BackupStore,
  type R2BackupConfig,
  LATEST_BACKUP_KEY,
  isHubBackupDumpKey,
  parseLatestJson,
  type LatestBackupStatus
} from "@/src/server/hub-backup";

export type R2BackupStore = BackupStore & {
  get: (key: string) => Promise<Buffer | null>;
  signedUrl: (key: string, expiresSeconds: number) => Promise<string>;
};

export function createR2Store(config: R2BackupConfig): R2BackupStore {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  const bucket = config.bucket;

  return {
    async list() {
      const objects: BackupObject[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: "hub/",
            ContinuationToken: token
          })
        );
        for (const item of page.Contents ?? []) {
          if (!item.Key) continue;
          objects.push({
            key: item.Key,
            lastModified: item.LastModified ?? new Date(0),
            bytes: item.Size ?? 0
          });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },
    async put(key, body, contentType) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length
        })
      );
    },
    async delete(keys) {
      if (keys.length === 0) return;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true }
        })
      );
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await result.Body?.transformToByteArray();
        return bytes ? Buffer.from(bytes) : null;
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (name === "NoSuchKey" || name === "NotFound" || status === 404) {
          return null;
        }
        throw error;
      }
    },
    async signedUrl(key, expiresSeconds) {
      const filename = key.split("/").pop() ?? "hub-backup.sql.gz";
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${filename}"`
        }),
        { expiresIn: expiresSeconds }
      );
    }
  };
}

export async function readBackupListing(store: R2BackupStore): Promise<{
  latest: LatestBackupStatus | null;
  dumps: Array<{ key: string; lastModified: string; bytes: number }>;
}> {
  const objects = await store.list();
  const dumps = objects
    .filter((object) => isHubBackupDumpKey(object.key))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
    .map((object) => ({
      key: object.key,
      lastModified: object.lastModified.toISOString(),
      bytes: object.bytes
    }));

  const raw = await store.get(LATEST_BACKUP_KEY);
  if (!raw) {
    return { latest: null, dumps };
  }
  try {
    return { latest: parseLatestJson(JSON.parse(raw.toString("utf8"))), dumps };
  } catch {
    return { latest: null, dumps };
  }
}
