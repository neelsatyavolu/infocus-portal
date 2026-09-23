export type EquipmentRequestStatus = "PENDING" | "APPROVED" | "DENIED";

export type RequestItem = {
  archivedAt: Date | string | null;
  checkedOut: boolean;
  onHoldForStudentId: string | null;
};

function isItemAvailable(item: RequestItem): boolean {
  return !item.archivedAt && !item.checkedOut && item.onHoldForStudentId == null;
}

export function canApproveRequest(input: {
  status: EquipmentRequestStatus;
  items: RequestItem[];
}): boolean {
  return input.status === "PENDING" && input.items.length > 0 && input.items.every(isItemAvailable);
}

export function canDenyRequest(input: {
  status: EquipmentRequestStatus;
  items: RequestItem[];
  anyCheckedOut: boolean;
  remainingHolds: number;
}): boolean {
  if (input.status === "PENDING") return true;
  if (input.status === "DENIED") return false;
  return !input.anyCheckedOut && input.remainingHolds > 0;
}

export function isRequestFulfilled(input: {
  status: EquipmentRequestStatus;
  remainingHolds: number;
}): boolean {
  return input.status === "APPROVED" && input.remainingHolds === 0;
}
