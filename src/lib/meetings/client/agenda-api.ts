import type { MeetingAgendaResponse } from "@/src/lib/meetings/agenda";
import { MeetingApiError } from "./api";

/** Agenda endpoints. Every call returns the whole ordered agenda. Throws with a user-facing message. */

async function request(path: string, init?: { method?: string; json?: unknown }): Promise<MeetingAgendaResponse> {
  const response = await fetch(path, {
    cache: "no-store",
    method: init?.method ?? "GET",
    headers: init?.json === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.json === undefined ? undefined : JSON.stringify(init.json)
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: MeetingAgendaResponse; error?: { message?: string } };
  if (!response.ok || !payload.data) {
    throw new MeetingApiError(payload.error?.message ?? "Couldn't update the agenda. Try again.", response.status);
  }
  return payload.data;
}

const base = (meetingId: string) => `/api/meetings/${encodeURIComponent(meetingId)}/agenda`;

export const agendaApi = {
  get: (meetingId: string) => request(base(meetingId)),
  add: (meetingId: string, text: string) => request(base(meetingId), { method: "POST", json: { text } }),
  update: (meetingId: string, itemId: string, patch: { text?: string; done?: boolean }) =>
    request(`${base(meetingId)}/${encodeURIComponent(itemId)}`, { method: "PATCH", json: patch }),
  remove: (meetingId: string, itemId: string) =>
    request(`${base(meetingId)}/${encodeURIComponent(itemId)}`, { method: "DELETE" }),
  reorder: (meetingId: string, itemIds: string[]) => request(`${base(meetingId)}/order`, { method: "PUT", json: { itemIds } })
};
