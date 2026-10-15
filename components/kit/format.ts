/** "Cycle 03 · Sports" — the one way a cycle is named in pickers and tabs. */
export function cycleLabel(cycleNumber: number, focus?: string | null) {
  const base = `Cycle ${String(cycleNumber).padStart(2, "0")}`;
  const trimmed = focus?.trim();
  return trimmed ? `${base} · ${trimmed}` : base;
}
