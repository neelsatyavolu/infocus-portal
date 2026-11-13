/**
 * Rough cuts stored on InFocus Drive are written `drive:<path>` in round settings and stored as
 * `nas:<path>` (relative to the Drive root, like MediaVersion.nasPath). Drive only mints links
 * under the Portal's folders, so the path must stay there.
 */
const NAS_PREFIX = "nas:";
const ALLOWED_ROOTS = ["Package Storage/", "Package Cycles/"];

/** The Drive path from a `drive:` source, or null when it isn't one. Throws on a path outside the Portal folders. */
export function parseDriveSource(source: string): string | null {
  const match = /^drive:\s*(.+)$/i.exec(source.trim());
  if (!match) return null;
  const path = match[1]!.trim().replace(/^\/+/, "");
  if (path.split("/").some((part) => part === ".." || part === ".") || !ALLOWED_ROOTS.some((root) => path.startsWith(root))) {
    throw new Error('Drive rough cuts must live under "Package Storage/" or "Package Cycles/".');
  }
  return path;
}

export function toStoredNasUrl(path: string) {
  return `${NAS_PREFIX}${path}`;
}

/** The Drive path from a stored `nas:` value, or null. */
export function storedNasPath(stored: string | null | undefined) {
  return stored?.startsWith(NAS_PREFIX) ? stored.slice(NAS_PREFIX.length) : null;
}
