/**
 * The newest Graphics Source tarball (and intros tarball) for editing Macs. The graphics repo is private, so the Portal holds a
 * read-only GitHub token (SHOW_EDITOR_GRAPHICS_TOKEN) and hands the Mac only GitHub's short-lived signed
 * download link, never the token. The graphics repo's workflow keeps one asset on the "graphics-source"
 * release, named after the commit it was built from. Its intros workflow does the same on the "intros" release
 * with every look's intro videos.
 */

const DEFAULT_REPO = "neelsatyavolu/infocus-graphics";
const DIGEST = /^sha256:([0-9a-f]{64})$/;

export type GraphicsSource =
  | { version: string; url: string; size: number; sha256: string | null }
  | { version: null; reason: string };

type Asset = { name?: unknown; url?: unknown; size?: unknown; state?: unknown; updated_at?: unknown; digest?: unknown };

type ReleaseKind = { tag: string; assetName: RegExp; label: string };

const GRAPHICS: ReleaseKind = { tag: "graphics-source", assetName: /^graphics-source-([0-9a-f]{40})\.tar\.gz$/, label: "Graphics Source" };
const INTROS: ReleaseKind = { tag: "intros", assetName: /^intros-([0-9a-f]{40})\.tar\.gz$/, label: "Intros" };

export function latestGraphicsSource(fetchImpl: typeof fetch = fetch, env: Record<string, string | undefined> = process.env) {
  return latestTarball(GRAPHICS, fetchImpl, env);
}

/** Every look's intro videos ("<look>/<file>" in the tarball), for the intro picker. */
export function latestIntros(fetchImpl: typeof fetch = fetch, env: Record<string, string | undefined> = process.env) {
  return latestTarball(INTROS, fetchImpl, env);
}

async function latestTarball(
  { tag, assetName, label }: ReleaseKind,
  fetchImpl: typeof fetch,
  env: Record<string, string | undefined>
): Promise<GraphicsSource> {
  const token = env.SHOW_EDITOR_GRAPHICS_TOKEN?.trim();
  if (!token) return { version: null, reason: "The Portal has no SHOW_EDITOR_GRAPHICS_TOKEN." };
  const repo = env.SHOW_EDITOR_GRAPHICS_REPO?.trim() || DEFAULT_REPO;
  const headers = {
    authorization: `Bearer ${token}`,
    "user-agent": "infocus-portal",
    "x-github-api-version": "2022-11-28"
  };

  const release = await fetchImpl(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    headers: { ...headers, accept: "application/vnd.github+json" }
  });
  if (release.status === 404) {
    return { version: null, reason: `No ${label} release found: none published yet, a wrong SHOW_EDITOR_GRAPHICS_REPO, or a token without access to it.` };
  }
  // A rate limit is passing: throw, so the Mac keeps its graphics for this job and asks again next time.
  if (release.status === 429 || (release.status === 403 && release.headers.get("x-ratelimit-remaining") === "0")) {
    throw new Error(`GitHub rate limit (${release.status})`);
  }
  // A bad token is a setup problem, not an outage: answering 500 would only make every Mac retry.
  if (release.status === 401 || release.status === 403) {
    console.error(`show editor graphics: GitHub refused SHOW_EDITOR_GRAPHICS_TOKEN (${release.status})`);
    return { version: null, reason: "GitHub refused the Portal's graphics token." };
  }
  if (!release.ok) throw new Error(`GitHub release lookup failed: ${release.status}`);

  const assets = ((await release.json()) as { assets?: Asset[] }).assets ?? [];
  const newest = assets
    .filter((a) => typeof a.name === "string" && assetName.test(a.name) && a.state === "uploaded")
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
  if (!newest) return { version: null, reason: `The ${label} release has no tarball yet.` };

  // GitHub answers an asset download with a redirect to a signed URL that works for a few minutes.
  const download = await fetchImpl(String(newest.url), {
    headers: { ...headers, accept: "application/octet-stream" },
    redirect: "manual"
  });
  const location = download.headers.get("location");
  await download.body?.cancel();
  if (download.status < 300 || download.status >= 400 || !location) {
    throw new Error(`GitHub asset download didn't redirect: ${download.status}`);
  }
  const digest = typeof newest.digest === "string" ? DIGEST.exec(newest.digest)?.[1] ?? null : null;
  return {
    version: assetName.exec(String(newest.name))![1],
    url: location,
    size: Number(newest.size),
    sha256: digest
  };
}
