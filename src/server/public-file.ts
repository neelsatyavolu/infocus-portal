import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isWorkersRuntime } from "@/src/lib/prisma-workers";

type AssetsEnv = { ASSETS?: { fetch(input: string): Promise<Response> } };

/**
 * A file from public/ (path relative to it). Off disk on Node; through the static-assets binding on
 * Cloudflare Workers, which has no project files.
 */
export async function readPublicFile(relative: string): Promise<Buffer> {
  if (relative.startsWith("/") || relative.split("/").includes("..")) throw new Error("Invalid public file path");
  if (!isWorkersRuntime()) return readFile(path.join(process.cwd(), "public", relative));
  const assets = (getCloudflareContext().env as AssetsEnv).ASSETS;
  if (!assets) throw new Error("ASSETS binding is missing");
  const response = await assets.fetch(`https://assets.local/${relative}`);
  if (!response.ok) throw new Error(`Public file ${relative} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
