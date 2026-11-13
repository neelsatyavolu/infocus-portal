/** Dates on the Applicant Portal are always shown in Pacific time, which is when deadlines fall. */
export function formatPacific(iso: string | Date, withTime = true) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: withTime ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {})
  });
}

/** "3 days, 4 hours left" style countdown; null once it has passed. */
export function countdown(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"} left`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}, ${mins} min left`;
  return `${mins} min left`;
}

/** An ISO instant as a datetime-local value in Pacific wall time ("2027-02-28T23:59"). */
export function toPacificInput(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Los_Angeles" }).slice(0, 16).replace(" ", "T");
}

/** A datetime-local value read as Pacific wall time, to an ISO instant (handles PST and PDT). */
export function pacificInputToIso(value: string) {
  for (const offset of ["-08:00", "-07:00"]) {
    const date = new Date(`${value}:00${offset}`);
    if (toPacificInput(date.toISOString()) === value) return date.toISOString();
  }
  return new Date(`${value}:00-08:00`).toISOString();
}
