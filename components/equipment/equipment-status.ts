import type { StatusToneInput } from "@/components/kit/tone";
import type { EquipmentItem, HubUser, RequestRow, StudentRef } from "@/components/equipment/equipment-api";
import { EQUIPMENT_OVERDUE_HOURS } from "@/src/lib/equipment-overdue";
import { canApproveRequest, canDenyRequest, isRequestFulfilled } from "@/src/lib/equipment-requests";
import { userDisplayName } from "@/src/lib/user-display";

/** Out this long counts as overdue (the same threshold drives the daily overdue emails). */
const OVERDUE_AFTER_MS = EQUIPMENT_OVERDUE_HOURS * 60 * 60 * 1000;

type ItemState = "out" | "held" | "in";

export function itemStatus(item: Pick<EquipmentItem, "checkedOut" | "onHoldForStudentId">): ItemState {
  if (item.checkedOut) return "out";
  if (item.onHoldForStudentId) return "held";
  return "in";
}

export function isOverdueItem(item: Pick<EquipmentItem, "checkedOut" | "checkedOutAt">, now: number) {
  if (!item.checkedOut || !item.checkedOutAt) return false;
  return new Date(item.checkedOutAt).getTime() <= now - OVERDUE_AFTER_MS;
}

/** Out is the normal state of lent gear, so it stays neutral; only overdue is Danger. */
export const ITEM_STATE: Record<ItemState | "overdue", { label: string; tone: StatusToneInput }> = {
  in: { label: "In", tone: "success" },
  out: { label: "Out", tone: "neutral" },
  held: { label: "Held", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" }
};

export function studentLabel(person: StudentRef | null | undefined) {
  if (!person) return "—";
  return person.name?.trim() || person.studentId || "Unknown";
}

export function hubLabel(person: Pick<HubUser, "name" | "nickname" | "email"> | null | undefined) {
  if (!person) return "—";
  return userDisplayName(person) || person.email || "Member";
}

function validDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "3:42 PM" */
export function formatTime(value: string | number | null | undefined) {
  const date = validDate(value);
  return date ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—";
}

/** "Mon, Oct 13", with the year when it is not this year ("Mon, Oct 13, 2025"). */
export function formatShortDate(value: string | number | null | undefined) {
  const date = validDate(value);
  if (!date) return "—";
  const otherYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(otherYear ? { year: "numeric" } : {})
  });
}

/** "Mon, Oct 13 · 3:42 PM" (with the year when it is not this year) */
export function formatShortDateTime(value: string | number | null | undefined) {
  const date = validDate(value);
  return date ? `${formatShortDate(value)} · ${formatTime(value)}` : "—";
}

/** "5h" under a day, "3d 4h" after. */
export function hoursOutLabel(iso: string | null | undefined, now: number) {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "0h";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function sdCardLabel(value: boolean | null | undefined) {
  return value === true ? "Yes" : value === false ? "No" : "—";
}

// ---------------------------------------------------------------------------------------------
// Requests. The gates reuse src/lib/equipment-requests (the same rules the server enforces).
// ---------------------------------------------------------------------------------------------

/** Items still held for this request (the hold belongs to it and is not checked out yet). */
export function remainingHolds(request: RequestRow) {
  return request.items.filter((entry) => entry.item.holdRequestId === request.id && entry.item.onHoldForStudentId).length;
}

function anyItemOut(request: RequestRow) {
  return request.items.some((entry) => entry.item.checkedOut);
}

export function canApprove(request: RequestRow) {
  return canApproveRequest({ status: request.status, items: request.items.map((entry) => entry.item) });
}

export function canDeny(request: RequestRow) {
  return canDenyRequest({
    status: request.status,
    items: request.items.map((entry) => entry.item),
    anyCheckedOut: anyItemOut(request),
    remainingHolds: remainingHolds(request)
  });
}

type RequestState = "pending" | "approved" | "fulfilled" | "denied";

export function requestState(request: RequestRow): RequestState {
  if (isRequestFulfilled({ status: request.status, remainingHolds: remainingHolds(request) })) return "fulfilled";
  if (request.status === "PENDING") return "pending";
  if (request.status === "APPROVED") return "approved";
  return "denied";
}

export const REQUEST_STATE: Record<RequestState, { label: string; tone: StatusToneInput }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  fulfilled: { label: "Fulfilled", tone: "success" },
  denied: { label: "Denied", tone: "muted" }
};

/** Why Approve (or both buttons) is missing, so the detail never ends in an unexplained gap. */
export function requestReason(request: RequestRow): string | null {
  const state = requestState(request);
  if (state === "fulfilled") return "Every held item has been checked out.";
  if (state === "denied") return "This request was denied.";
  if (state === "approved" && !canDeny(request)) return "Can't deny while an item is out.";
  if (state === "pending" && !canApprove(request)) return "Approve appears while every item is in, not held and not archived.";
  return null;
}

/** Pending first, then the API order (newest first). */
export function sortRequests(requests: RequestRow[]) {
  return [...requests.filter((row) => row.status === "PENDING"), ...requests.filter((row) => row.status !== "PENDING")];
}

/** "1 item" / "3 items" */
export function itemCountLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
