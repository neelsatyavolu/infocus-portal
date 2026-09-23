export const PACKAGE_ROSTER_NOTE_MAX = 4000;

/** Incoming POST value wins; omitted fields keep the stored note. */
export function nextPackageRosterNote(incoming: string | undefined, prior: string | undefined) {
  if (incoming === undefined) return prior ?? "";
  return incoming.slice(0, PACKAGE_ROSTER_NOTE_MAX);
}
