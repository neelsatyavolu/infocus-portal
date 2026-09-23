import { listShowRolesPool } from "@/src/server/show-cast";
import { resolveShowManagers } from "@/src/server/show-manager";

/** Resolve manager duty from the calendar, never from client-supplied history. */
export async function withAssociateShowManagers<T extends { date: string }>(shows: T[]) {
  const [cast, resolved] = await Promise.all([
    listShowRolesPool(),
    resolveShowManagers(shows.map((show) => show.date))
  ]);
  const eligible = new Set(cast.members.filter((name) => !cast.randomExempt.includes(name)));
  // The manager pool contains only APs, EPs, and super-admin; eligible removes the latter two.
  const associates = new Set(resolved.pool.filter((name) => eligible.has(name)));
  return shows.map((show) => {
    const name = resolved.managers[show.date]?.name ?? "";
    return { ...show, associateShowManager: associates.has(name) ? name : "" };
  });
}
