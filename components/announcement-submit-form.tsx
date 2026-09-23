"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Megaphone } from "lucide-react";
import {
  MAX_SHOW_DAYS,
  maxAnnouncementEndDate,
  RUN_ON_OPTIONS,
  SUBMITTER_KIND_OPTIONS
} from "@/src/lib/announcement-submission";
import { formatShowDateShort } from "@/src/lib/show-assignment";

const fieldClass =
  "h-11 w-full rounded-xl border border-border bg-secondary px-3 text-sm text-foreground outline-none transition focus:border-[var(--brand-green)]";
const textareaClass =
  "w-full resize-y rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--brand-green)]";

type SubmitSuccess = {
  id: string;
};

export function AnnouncementSubmitForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitterKind, setSubmitterKind] = useState("");
  const [runOn, setRunOn] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [mediaLink, setMediaLink] = useState("");
  const [moreInfo, setMoreInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<SubmitSuccess | null>(null);

  const maxEndDate = useMemo(() => (startDate ? maxAnnouncementEndDate(startDate) : null), [startDate]);
  const maxEndDateLabel = maxEndDate ? formatShowDateShort(maxEndDate) : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/announcements/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          name,
          submitterKind,
          runOn,
          announcement,
          startDate,
          endDate,
          policyAgreed,
          mediaLink,
          moreInfo
        })
      });
      const payload = (await response.json()) as {
        data?: SubmitSuccess;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not submit announcement.");
      }

      setSuccess(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit announcement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-[var(--brand-green)]/35 bg-[var(--brand-green)]/10 p-6">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-[var(--brand-green)]/40 bg-[var(--brand-green)]/15 text-[var(--brand-green)]">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h2 className="display-sm text-foreground">Announcement submitted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          InFocus will review it for grammar, clarity, and unprotected speech. It will only run if accepted, and for at
          most four consecutive show days.
        </p>
        <button
          type="button"
          onClick={() => {
            setSuccess(null);
            setAnnouncement("");
            setMediaLink("");
            setMoreInfo("");
            setPolicyAgreed(false);
          }}
          className="mt-4 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
      {compact ? null : (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          <p>
            Announcements run for a maximum of four consecutive show days on InFocus (Wednesday and Friday broadcasts).
            The Friday Schoology deadline is 4 p.m. Thursday. InFocus executive producers may accept, reject, or edit any
            announcement.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Email *</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
            placeholder="you@pausd.org"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Full name *</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
            placeholder="First and last name"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Which best describes you? *</span>
        <select
          required
          value={submitterKind}
          onChange={(event) => setSubmitterKind(event.target.value)}
          className={fieldClass}
        >
          <option value="">Select one</option>
          {SUBMITTER_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Where should this run? *</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {RUN_ON_OPTIONS.map((option) => {
            const selected = runOn === option.value;
            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border px-3 py-3 text-sm font-medium transition ${
                  selected
                    ? "border-[var(--brand-green)] bg-[var(--brand-green)]/10 text-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                }`}
              >
                <input
                  type="radio"
                  name="runOn"
                  value={option.value}
                  checked={selected}
                  onChange={() => setRunOn(option.value)}
                  className="sr-only"
                  required
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Write your announcement *</span>
        <textarea
          required
          value={announcement}
          onChange={(event) => setAnnouncement(event.target.value)}
          rows={6}
          className={textareaClass}
          placeholder="Write the announcement as it should be read or posted."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Start date *</span>
          <input
            type="date"
            required
            value={startDate}
            onChange={(event) => {
              const nextStart = event.target.value;
              setStartDate(nextStart);
              if (endDate && nextStart && endDate < nextStart) {
                setEndDate(nextStart);
              }
              const nextMax = nextStart ? maxAnnouncementEndDate(nextStart) : null;
              if (endDate && nextMax && endDate > nextMax) {
                setEndDate(nextMax);
              }
            }}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">End date *</span>
          <input
            type="date"
            required
            min={startDate || undefined}
            max={maxEndDate || undefined}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={fieldClass}
          />
          <span className="block text-[11px] text-muted-foreground">
            Maximum {MAX_SHOW_DAYS} consecutive show days
            {maxEndDateLabel ? ` (through ${maxEndDateLabel})` : ""}.
          </span>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Photo or media Google Drive link</span>
        <input
          type="url"
          value={mediaLink}
          onChange={(event) => setMediaLink(event.target.value)}
          className={fieldClass}
          placeholder="https://drive.google.com/..."
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Anything else we should know?</span>
        <textarea
          value={moreInfo}
          onChange={(event) => setMoreInfo(event.target.value)}
          rows={3}
          className={textareaClass}
        />
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={policyAgreed}
          onChange={(event) => setPolicyAgreed(event.target.checked)}
          className="mt-1 h-4 w-4 accent-[var(--brand-green)]"
          required
        />
        <span>
          I agree to the InFocus announcement policy. Announcements run for a maximum of four consecutive show days.
          InFocus students may accept, reject, or edit announcements for grammar, clarity, and unprotected speech.
        </span>
      </label>

      {message ? <p className="text-sm text-amber-300">{message}</p> : null}

      <button
        type="submit"
        disabled={submitting || !policyAgreed}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-green)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--brand-green-deep)] disabled:opacity-60"
      >
        <Megaphone className="h-4 w-4" />
        {submitting ? "Submitting..." : "Submit announcement"}
      </button>
    </form>
  );
}
