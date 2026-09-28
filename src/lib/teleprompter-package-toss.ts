/** The A3 template line a package toss replaces. */
export const PACKAGE_TOSS_PLACEHOLDER = "[INSERT PACKAGE TOSS]";

export type ShowPackageToss = { title: string; toss: string };

function namedPlaceholder(title: string) {
  return `[INSERT PACKAGE TOSS: ${title}]`;
}

function tossLine(pkg: ShowPackageToss) {
  return pkg.toss.trim() || namedPlaceholder(pkg.title);
}

/**
 * Fills the A3 package section from the tosses of the show's queued packages.
 * The plain placeholder becomes the first package (read by the co-anchor); any
 * other package gets its own block for the anchor. A package without a toss
 * keeps a placeholder with its title, which a later call fills in. Text a
 * producer has already written is never replaced.
 */
export function fillPackageTosses(content: string, packages: ShowPackageToss[]) {
  if (packages.length === 0) return content;
  let next = content;
  if (next.includes(PACKAGE_TOSS_PLACEHOLDER)) {
    const [first, ...rest] = packages;
    next = next.replace(PACKAGE_TOSS_PLACEHOLDER, () => tossLine(first));
    for (const pkg of rest) {
      next = `${next}\n\nCAM 2\n{ANCHOR}\n${tossLine(pkg)}\n\n{ROLL PACKAGE}\n{HOLD}`;
    }
  }
  for (const pkg of packages) {
    if (pkg.toss.trim()) next = next.replace(namedPlaceholder(pkg.title), () => pkg.toss.trim());
  }
  return next;
}
