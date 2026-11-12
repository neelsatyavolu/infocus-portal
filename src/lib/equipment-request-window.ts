/**
 * When a student plans to pick gear up and bring it back. The form takes Pacific wall times
 * (datetime-local) and sends UTC ISO instants; the server checks them with these rules.
 */

/** A pickup a few minutes old still counts as "now" (the form was filled, then submitted). */
export const PICKUP_GRACE_MS = 5 * 60 * 1000;

export type RequestWindowError = "PICKUP_IN_PAST" | "RETURN_BEFORE_PICKUP";

export const REQUEST_WINDOW_MESSAGES: Record<RequestWindowError, string> = {
  PICKUP_IN_PAST: "Pickup can't be in the past.",
  RETURN_BEFORE_PICKUP: "Return must be after pickup."
};

export function validateRequestWindow(input: { pickupAt: Date; returnAt: Date; now?: Date }): RequestWindowError | null {
  const now = input.now ?? new Date();
  if (input.pickupAt.getTime() < now.getTime() - PICKUP_GRACE_MS) return "PICKUP_IN_PAST";
  if (input.returnAt.getTime() <= input.pickupAt.getTime()) return "RETURN_BEFORE_PICKUP";
  return null;
}

const windowFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

/** "Tue, Nov 17, 3:30 PM" in Pacific time; "—" when unset. */
export function formatPacificWindowTime(at: Date | string | null | undefined) {
  if (!at) return "—";
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "—" : windowFormat.format(date);
}
