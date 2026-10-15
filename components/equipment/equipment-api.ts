/**
 * Shared fetch helpers and data shapes for the equipment pages (Checkout, Request, Manage).
 * Every route answers `{ data }` on success and `{ error: { message } }` on failure.
 */

export type FormStatus = { type: "error" | "success" | "info"; text: string } | null;

export type StudentRef = {
  id: string;
  name: string | null;
  studentId: string;
  email?: string | null;
};

export type EquipmentItem = {
  id: string;
  name: string;
  barcode: string;
  checkedOut: boolean;
  tookSdCard?: boolean | null;
  checkedOutAt: string | null;
  checkedOutById: string | null;
  onHoldForStudentId: string | null;
  holdRequestId: string | null;
  archivedAt: string | null;
  checkedOutBy?: StudentRef | null;
  onHoldForStudent?: StudentRef | null;
};

export type RequestRow = {
  id: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  email: string;
  createdAt: string;
  student: StudentRef | null;
  items: Array<{ id: string; item: EquipmentItem }>;
};

export type HubUser = {
  id: string;
  name: string | null;
  nickname?: string | null;
  email: string | null;
};

export type ManagerRow = {
  id: string;
  userId: string;
  createdAt: string;
  user: HubUser | null;
};

/** An error that keeps the HTTP status (checkout locks itself on 401/403). */
export type ApiError = Error & { status: number };

/** Unwraps `{ data }`, or throws the server's message with the HTTP status attached. */
export async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) {
    const error = new Error(body?.error?.message || "Request failed") as ApiError;
    error.status = res.status;
    throw error;
  }
  return body?.data as T;
}

/** JSON request (POST/PATCH) with the same unwrapping as readJson. */
export async function sendJson<T = unknown>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  return readJson<T>(
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function errorStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error ? Number((error as ApiError).status) : 0;
}
