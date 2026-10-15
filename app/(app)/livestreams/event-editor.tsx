"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { Field, FormSection, fieldClass } from "@/components/kit/field";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Sheet } from "@/components/kit/sheet";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitShortcutHint, isSubmitShortcut } from "@/components/ui/submit-shortcut";
import { LIVESTREAM_STATUS_LABELS } from "@/src/lib/livestream";
import { cn } from "@/src/lib/utils";
import { CrewField } from "./crew-field";
import {
  addAttendee,
  emptyForm,
  eventPayload,
  formFromEvent,
  removeAttendee,
  setAttendeeCredit,
  validateForm,
  type EventFormField,
  type EventFormErrors,
  type EventFormState
} from "./livestreams-form";
import { memberLabel, personLabel, type EventRow, type LivestreamStatus, type Member, type Person } from "./livestreams-model";
import { errorMessage } from "./use-livestreams-data";

export type EditorTarget = { key: number; event: EventRow | null; complete: boolean };

const STATUS_OPTIONS: Array<{ value: LivestreamStatus; label: string }> = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" }
];

const STATUS_TONE = { SCHEDULED: "neutral", COMPLETED: "success", CANCELLED: "neutral" } as const;

/** Form order, so a failed save puts the cursor on the first field that needs fixing. */
const FIELD_ORDER: EventFormField[] = ["title", "startsAt", "arrivalTime", "hours", "capacity"];

/** Appointed managers first (only they earn credit for managing), then everyone else. */
function ManagerSelect({
  id,
  value,
  onChange,
  managers,
  members,
  current
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  managers: Person[];
  members: Member[] | null;
  current: Person | null;
}) {
  const managerIds = new Set(managers.map((manager) => manager.id));
  const others = (members ?? []).filter((member) => !managerIds.has(member.id));
  const known = managerIds.has(value) || others.some((member) => member.id === value);
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">None</option>
      {value && !known ? <option value={value}>{personLabel(current)}</option> : null}
      {managers.length ? (
        <optgroup label="Livestream managers">
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {personLabel(manager)} · Manager
            </option>
          ))}
        </optgroup>
      ) : null}
      {others.length ? (
        <optgroup label="Everyone else">
          {others.map((member) => (
            <option key={member.id} value={member.id}>
              {memberLabel(member)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </NativeSelect>
  );
}

/**
 * Add or edit a livestream in a side sheet (full height on desktop, a bottom sheet on phones):
 * one scrolling body in the order people close out a livestream, errors beside their fields
 * or just above the footer, ⌘/Ctrl+Enter saves from anywhere. Payload mapping is unchanged.
 */
export function EventEditor({
  target,
  managers,
  members,
  membersError,
  onRetryMembers,
  onSave,
  onDelete,
  onClose
}: {
  target: EditorTarget;
  managers: Person[];
  members: Member[] | null;
  membersError: string | null;
  onRetryMembers: () => void;
  onSave: (eventId: string | null, body: ReturnType<typeof eventPayload>) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { event } = target;
  const formId = useId();
  const [form, setForm] = useState<EventFormState>(() => (event ? formFromEvent(event, target.complete) : emptyForm()));
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hoursRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const ids = {
    title: `${formId}-title`,
    startsAt: `${formId}-starts`,
    arrivalTime: `${formId}-arrival`,
    location: `${formId}-location`,
    hours: `${formId}-hours`,
    availability: `${formId}-availability`,
    capacity: `${formId}-capacity`,
    manager: `${formId}-manager`,
    notes: `${formId}-notes`
  };
  const creditIdPrefix = `${formId}-credit`;

  // "Complete…" opens with Completed preset; put the cursor on the hours that must be filled.
  useEffect(() => {
    if (!target.complete) return;
    const timer = window.setTimeout(() => hoursRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [target.complete]);

  useEffect(() => {
    if (apiError) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [apiError]);

  const update = (patch: Partial<EventFormState>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    if (saving) return;
    const found = validateForm(form);
    setErrors(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }
    if (found.credits?.length) {
      document.getElementById(`${creditIdPrefix}-${found.credits[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setApiError(null);
    try {
      await onSave(event?.id ?? null, eventPayload(form));
      toast.success("Livestream saved");
      onClose();
    } catch (e) {
      setApiError(errorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  // Throws on failure so the confirm dialog stays open for a retry.
  async function remove() {
    if (!event) return;
    try {
      await onDelete(event.id);
      toast.success("Livestream deleted");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Delete failed"));
      throw e;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (!isSubmitShortcut(e)) return;
    e.preventDefault();
    void save();
  }

  const capacity = Number(form.capacity) || 0;

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        width="lg"
        title={event ? "Edit livestream" : "New livestream"}
        description={event ? "Update schedule details, crew, and hours." : "Add an event to the semester schedule."}
        headerExtra={
          event ? (
            <StatusTag tone={STATUS_TONE[event.status]}>
              {event.status === "CANCELLED" ? <span className="line-through">Cancelled</span> : LIVESTREAM_STATUS_LABELS[event.status]}
            </StatusTag>
          ) : undefined
        }
        footer={
          <>
            {event ? (
              <Button type="button" variant="destructive-quiet" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            ) : null}
            <span className="items-center max-lg:hidden lg:flex">
              <SubmitShortcutHint action="save" />
            </span>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={saving}>
              {saving ? <Spinner /> : null}
              Save
            </Button>
          </>
        }
      >
        {/* noValidate: validateForm's inline errors show for Save and ⌘/Ctrl+Enter alike, never the browser bubble. */}
        <form id={formId} noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} className="space-y-6">
          <FormSection title="Event" cols={2}>
            <Field label="Event name" htmlFor={ids.title} error={errors.title} span={2}>
              <input
                id={ids.title}
                className={fieldClass}
                value={form.title}
                aria-invalid={Boolean(errors.title) || undefined}
                aria-describedby={errors.title ? `${ids.title}-error` : undefined}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. Choir Pops Concert"
              />
            </Field>
            <Field label="Date & event start time" htmlFor={ids.startsAt} error={errors.startsAt}>
              <input
                id={ids.startsAt}
                type="datetime-local"
                required
                className={fieldClass}
                value={form.startsAt}
                aria-invalid={Boolean(errors.startsAt) || undefined}
                aria-describedby={errors.startsAt ? `${ids.startsAt}-error` : undefined}
                onChange={(e) => update({ startsAt: e.target.value })}
              />
            </Field>
            <Field label="Crew arrival time" htmlFor={ids.arrivalTime} error={errors.arrivalTime} hint="Same day as the start">
              <input
                id={ids.arrivalTime}
                type="time"
                required
                className={fieldClass}
                value={form.arrivalTime}
                aria-invalid={Boolean(errors.arrivalTime) || undefined}
                aria-describedby={errors.arrivalTime ? `${ids.arrivalTime}-error` : `${ids.arrivalTime}-hint`}
                onChange={(e) => update({ arrivalTime: e.target.value })}
              />
            </Field>
            <Field label="Location" htmlFor={ids.location} span={2}>
              <input
                id={ids.location}
                className={fieldClass}
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="PAC, Gym, LAX Field…"
              />
            </Field>
          </FormSection>

          <FormSection title="Status and credit" cols={2}>
            <Field label="Status" span={2}>
              <SegmentedControl
                ariaLabel="Status"
                fullWidth
                value={form.status}
                onChange={(status) => update({ status })}
                options={STATUS_OPTIONS}
              />
            </Field>
            <Field
              label={`Default credit hours${form.status === "COMPLETED" ? " (required)" : ""}`}
              htmlFor={ids.hours}
              span={2}
              error={errors.hours}
              hint="Credit applies only to completed events. Set default hours to 0 to cancel all credit, including individual overrides. Attendance is retained."
            >
              <div className="flex gap-2">
                <input
                  ref={hoursRef}
                  id={ids.hours}
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  className={cn(fieldClass, "font-mono-broadcast tabular-nums sm:w-40")}
                  value={form.hours}
                  aria-invalid={Boolean(errors.hours) || undefined}
                  aria-describedby={errors.hours ? `${ids.hours}-error` : `${ids.hours}-hint`}
                  onChange={(e) => update({ hours: e.target.value })}
                  placeholder="e.g. 3"
                />
                <Button type="button" variant="destructive-quiet" className="shrink-0" onClick={() => update({ hours: "0" })}>
                  Cancel credit
                </Button>
              </div>
            </Field>
            <Field label="Availability" htmlFor={ids.availability}>
              <NativeSelect
                id={ids.availability}
                value={form.availability}
                onChange={(e) => update({ availability: e.target.value as EventFormState["availability"] })}
              >
                <option value="PUBLIC">Public</option>
                <option value="UNLISTED">Unlisted</option>
                <option value="UNCONFIRMED">Unconfirmed</option>
              </NativeSelect>
            </Field>
            <Field label="Capacity" htmlFor={ids.capacity} error={errors.capacity}>
              <input
                id={ids.capacity}
                type="number"
                min={1}
                max={50}
                className={cn(fieldClass, "font-mono-broadcast tabular-nums")}
                value={form.capacity}
                aria-invalid={Boolean(errors.capacity) || undefined}
                aria-describedby={errors.capacity ? `${ids.capacity}-error` : undefined}
                onChange={(e) => update({ capacity: e.target.value })}
              />
            </Field>
          </FormSection>

          <CrewField
            attendeeIds={form.attendeeUserIds}
            credits={form.attendeeCredits}
            capacity={capacity}
            defaultHours={form.hours}
            members={members}
            membersError={membersError}
            onRetryMembers={onRetryMembers}
            event={event}
            creditIdPrefix={creditIdPrefix}
            creditErrors={errors.credits}
            onAdd={(userId) => setForm((current) => addAttendee(current, userId))}
            onRemove={(userId) => setForm((current) => removeAttendee(current, userId))}
            onCreditChange={(userId, value) => setForm((current) => setAttendeeCredit(current, userId, value))}
          />

          <FormSection title="Manager and notes">
            <Field
              label="Event manager"
              htmlFor={ids.manager}
              hint="Anyone can manage an event; only appointed livestream managers earn credit for it."
            >
              <ManagerSelect
                id={ids.manager}
                value={form.managerUserId}
                onChange={(managerUserId) => update({ managerUserId })}
                managers={managers}
                members={members}
                current={event?.manager ?? null}
              />
            </Field>
            <Field label="Notes" htmlFor={ids.notes}>
              <textarea
                id={ids.notes}
                className={cn(fieldClass, "h-auto min-h-[88px] py-2")}
                value={form.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </Field>
          </FormSection>

          {apiError ? (
            <div ref={errorRef}>
              <Alert tone="danger">{apiError}</Alert>
            </div>
          ) : null}
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this livestream event?"
        description="This removes it from the semester schedule. This can't be undone."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </>
  );
}
