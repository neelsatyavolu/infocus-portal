import type {
  JoinResponse,
  KeyResponse,
  MeetingAccessValue,
  MeetingDetail,
  MeetingInviteListResponse,
  MeetingListResponse,
  MeetingPeopleResponse,
  MeetingSummary,
  MeetingTranscriptResponse
} from "@/src/lib/meetings/types";

/** Thin client for the Portal Meetings API. Throws Error with a user-facing message. */

export class MeetingApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "MeetingApiError";
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path, {
    cache: "no-store",
    ...rest,
    headers: json === undefined ? rest.headers : { "Content-Type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json)
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok || payload.data === undefined) {
    throw new MeetingApiError(payload.error?.message ?? "Something went wrong. Try again.", response.status);
  }
  return payload.data;
}

const base = (id: string) => `/api/meetings/${encodeURIComponent(id)}`;

export type MeetingPatch = Partial<
  Pick<MeetingSummary, "title" | "startsAt" | "durationMinutes" | "quickAccess" | "notesEnabled">
> & { status?: "CANCELED"; inviteeUserIds?: string[] };

export type MeetingCreate = {
  title: string;
  startsAt?: string;
  durationMinutes?: number;
  access?: MeetingAccessValue;
  inviteeUserIds?: string[];
};


export const meetingsApi = {
  list: () => request<MeetingListResponse>("/api/meetings"),
  create: (body: MeetingCreate) =>
    request<{ meeting: MeetingSummary }>("/api/meetings", { method: "POST", json: body }),
  get: (id: string) => request<{ meeting: MeetingDetail }>(base(id)),
  patch: (id: string, body: MeetingPatch) =>
    request<{ meeting: MeetingSummary }>(base(id), { method: "PATCH", json: body }),
  transcript: (id: string) => request<MeetingTranscriptResponse>(`${base(id)}/transcript`),
  join: (id: string) => request<JoinResponse>(`${base(id)}/join`, { method: "POST", json: {} }),
  key: (id: string) => request<KeyResponse>(`${base(id)}/key`),
  /** Fresh room ticket + current key for an admitted participant (410 ended, 403 removed, 401 signed out). */
  ticket: (id: string) =>
    request<{ roomToken: string; roomUrl: string; key: KeyResponse }>(`${base(id)}/ticket`, { method: "POST", json: {} }),
  participant: (id: string, userId: string, action: "admit" | "deny" | "remove") =>
    request<unknown>(`${base(id)}/participants/${encodeURIComponent(userId)}`, { method: "POST", json: { action } }),
  admitAll: (id: string) => request<unknown>(`${base(id)}/admit-all`, { method: "POST", json: {} }),
  end: (id: string) => request<unknown>(`${base(id)}/end`, { method: "POST", json: {} }),
  people: () => request<MeetingPeopleResponse>("/api/meetings/people"),
  invites: () => request<MeetingInviteListResponse>("/api/meetings/invites"),
  addInvite: (body: { email: string; name?: string; userId?: string }) =>
    request<unknown>("/api/meetings/invites", { method: "POST", json: body }),
  linkInvite: (inviteId: string, userId: string | null) =>
    request<unknown>(`/api/meetings/invites/${encodeURIComponent(inviteId)}`, { method: "PATCH", json: { userId } }),
  removeInvite: (inviteId: string) =>
    request<unknown>(`/api/meetings/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" }),
  resendInvites: () => request<unknown>("/api/meetings/invites/send-all", { method: "POST", json: {} })
};

export function errorMessage(error: unknown, fallback = "Something went wrong. Try again.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
