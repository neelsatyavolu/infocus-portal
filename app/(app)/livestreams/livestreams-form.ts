import type { EventRow, LivestreamAvailability, LivestreamStatus } from "./livestreams-model";
import { toLocalInputValue } from "./livestreams-model";

export type EventFormState = {
  title: string;
  startsAt: string;
  arrivalTime: string;
  location: string;
  status: LivestreamStatus;
  availability: LivestreamAvailability;
  hours: string;
  capacity: string;
  notes: string;
  managerUserId: string;
  attendeeUserIds: string[];
  attendeeCredits: Record<string, string>;
};

export type EventFormField = "title" | "startsAt" | "arrivalTime" | "hours" | "capacity";
export type EventFormErrors = Partial<Record<EventFormField, string>> & {
  /** Crew members whose own credit hours are out of range (CREDIT_ERROR says why). */
  credits?: string[];
};

export const HOURS_ERROR = "Hours must be from 0 to 24, in steps of 0.25.";
export const CAPACITY_ERROR = "Capacity must be a whole number from 1 to 50.";
export const CREDIT_ERROR = "Credit hours must be from 0 to 24, in steps of 0.25.";

/** A new event: now, Unconfirmed, capacity 4 (same defaults as before). */
export function emptyForm(): EventFormState {
  return {
    title: "",
    startsAt: toLocalInputValue(),
    arrivalTime: "",
    location: "",
    status: "SCHEDULED",
    availability: "UNCONFIRMED",
    hours: "",
    capacity: "4",
    notes: "",
    managerUserId: "",
    attendeeCredits: {},
    attendeeUserIds: []
  };
}

/** Every field from the event; `complete` presets Status to Completed (the "Complete…" shortcut). */
export function formFromEvent(event: EventRow, complete = false): EventFormState {
  return {
    title: event.title,
    startsAt: toLocalInputValue(event.startsAt),
    arrivalTime: event.arrivesAt ? toLocalInputValue(event.arrivesAt).slice(11) : "",
    location: event.location,
    status: complete ? "COMPLETED" : event.status,
    availability: event.availability,
    hours: event.hours == null ? "" : String(event.hours),
    capacity: String(event.capacity),
    notes: event.notes,
    managerUserId: event.manager?.id ?? "",
    attendeeCredits: Object.fromEntries(
      event.attendees.map((attendee) => [attendee.id, attendee.creditHours == null ? "" : String(attendee.creditHours)])
    ),
    attendeeUserIds: event.attendees.map((attendee) => attendee.id)
  };
}

/** Blank, or 0–24 in quarter hours (the inputs' min, max and step, and the API's range). */
function validHours(value: string) {
  if (!value.trim()) return true;
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 0 && hours <= 24 && Number.isInteger(Math.round(hours * 4 * 1e6) / 1e6);
}

/** Blank (the default 4), or a whole number 1–50. */
function validCapacity(value: string) {
  if (!value.trim()) return true;
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity >= 1 && capacity <= 50;
}

/**
 * The three required fields, plus the number limits the browser used to enforce (the form is
 * noValidate so every message shows beside its field, for Save and ⌘/Ctrl+Enter alike).
 */
export function validateForm(form: EventFormState): EventFormErrors {
  const errors: EventFormErrors = {};
  if (!form.title.trim()) errors.title = "Title is required.";
  if (!form.startsAt) errors.startsAt = "Event start time is required.";
  if (!form.arrivalTime) errors.arrivalTime = "Arrival time is required.";
  if (!validHours(form.hours)) errors.hours = HOURS_ERROR;
  if (!validCapacity(form.capacity)) errors.capacity = CAPACITY_ERROR;
  const credits = form.attendeeUserIds.filter((userId) => !validHours(form.attendeeCredits[userId] ?? ""));
  if (credits.length) errors.credits = credits;
  return errors;
}

/** Request body for POST /api/livestreams/events and PATCH /api/livestreams/events/:id (unchanged). */
export function eventPayload(form: EventFormState) {
  return {
    title: form.title.trim(),
    startsAt: new Date(form.startsAt).toISOString(),
    arrivesAt: new Date(`${form.startsAt.slice(0, 10)}T${form.arrivalTime}`).toISOString(),
    location: form.location.trim(),
    status: form.status,
    availability: form.availability,
    hours: form.hours === "" ? null : Number(form.hours),
    capacity: Number(form.capacity) || 4,
    notes: form.notes,
    managerUserId: form.managerUserId || null,
    attendeeCredits: form.attendeeUserIds.map((userId) => ({
      userId,
      creditHours: form.attendeeCredits[userId]?.trim() ? Number(form.attendeeCredits[userId]) : null
    })),
    attendeeUserIds: form.attendeeUserIds
  };
}

export function addAttendee(form: EventFormState, userId: string): EventFormState {
  if (form.attendeeUserIds.includes(userId)) return form;
  return { ...form, attendeeUserIds: [...form.attendeeUserIds, userId] };
}

export function removeAttendee(form: EventFormState, userId: string): EventFormState {
  return { ...form, attendeeUserIds: form.attendeeUserIds.filter((id) => id !== userId) };
}

export function setAttendeeCredit(form: EventFormState, userId: string, value: string): EventFormState {
  return { ...form, attendeeCredits: { ...form.attendeeCredits, [userId]: value } };
}
