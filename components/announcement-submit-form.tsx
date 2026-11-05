"use client";

import { FormEvent, KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Megaphone } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Field, FormSection } from "@/components/kit/field";
import { RadioCards } from "@/components/kit/radio-cards";
import { StatusTag } from "@/components/kit/status-tag";
import { AnnouncementRulesPanel } from "@/components/public-entry/announcement-rules";
import { ENTRY_CONTROL, ENTRY_FOOTER_CONTROL, ENTRY_PAD_X, EntryPanel } from "@/components/public-entry/entry-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_SHOW_DAYS,
  maxAnnouncementEndDate,
  RUN_ON_OPTIONS,
  SUBMITTER_KIND_OPTIONS,
  type RunOn
} from "@/src/lib/announcement-submission";
import { formatShowDateShort } from "@/src/lib/show-assignment";
import { cn } from "@/src/lib/utils";

/** Mirrors `announcement: z.string().trim().max(4000)` in announcementSubmitSchema (src/lib/announcement-submission.ts). */
const MAX_ANNOUNCEMENT_CHARS = 4000;

const SECTION_CLASS = cn(ENTRY_PAD_X, "py-4 md:py-5");
const RUN_ON_CARDS = RUN_ON_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

/**
 * The numbered step headings read as headings (14px semibold, sentence case), so they don't
 * match the 11px caps field labels underneath them.
 */
function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-sm font-semibold normal-case tracking-normal text-foreground">{children}</span>;
}

type SubmitSuccess = {
  id: string;
};

export function AnnouncementSubmitForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitterKind, setSubmitterKind] = useState("");
  const [runOn, setRunOn] = useState<RunOn | "">("");
  const [announcement, setAnnouncement] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [mediaLink, setMediaLink] = useState("");
  const [moreInfo, setMoreInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<SubmitSuccess | null>(null);
  const successRef = useRef<HTMLElement>(null);

  const maxEndDate = useMemo(() => (startDate ? maxAnnouncementEndDate(startDate) : null), [startDate]);
  const maxEndDateLabel = maxEndDate ? formatShowDateShort(maxEndDate) : null;
  const announcementLength = announcement.trim().length;

  // The form (and its focused Submit button) is replaced on success: move focus to the result.
  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

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

  function onStartDateChange(nextStart: string) {
    setStartDate(nextStart);
    if (endDate && nextStart && endDate < nextStart) {
      setEndDate(nextStart);
    }
    const nextMax = nextStart ? maxAnnouncementEndDate(nextStart) : null;
    if (endDate && nextMax && endDate > nextMax) {
      setEndDate(nextMax);
    }
  }

  /** Cmd/Ctrl+Enter submits through the form, so the browser's required checks still run. */
  function onAnnouncementKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    if (!submitting) event.currentTarget.form?.requestSubmit();
  }

  function submitAnother() {
    flushSync(() => {
      setSuccess(null);
      setAnnouncement("");
      setMediaLink("");
      setMoreInfo("");
      setPolicyAgreed(false);
    });
    // Details and dates are kept, so the next thing to fill is the announcement itself.
    document.getElementById("announcement-text")?.focus();
  }

  const main = success ? (
    <EntryPanel
      id="announcement-submitted"
      ref={successRef}
      tabIndex={-1}
      className="outline-none"
      title="Announcement submitted"
      status={<StatusTag tone="success">Submitted</StatusTag>}
      footer={
        <>
          <span>Submit another keeps your details and dates.</span>
          <button type="button" className={cn(ENTRY_FOOTER_CONTROL, "ml-auto")} onClick={submitAnother}>
            Submit another
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--ink-text)]">
        InFocus will review it for grammar, clarity, and unprotected speech. It will only run if accepted, and for at most{" "}
        {MAX_SHOW_DAYS} consecutive show days.
      </p>
    </EntryPanel>
  ) : (
    <form
      onSubmit={(event) => void onSubmit(event)}
      aria-label="Announcement request"
      className="min-w-0 divide-y divide-border rounded-md border border-border bg-card"
    >
      <FormSection title={<SectionTitle>1 · About you</SectionTitle>} cols={2} className={SECTION_CLASS}>
        <Field label="Email" htmlFor="announcement-email" required>
          <Input
            id="announcement-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={ENTRY_CONTROL}
            placeholder="you@pausd.org"
          />
        </Field>
        <Field label="Full name" htmlFor="announcement-name" required>
          <Input
            id="announcement-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={ENTRY_CONTROL}
            placeholder="First and last name"
          />
        </Field>
        <Field label="Which best describes you?" htmlFor="announcement-kind" required span={2}>
          <NativeSelect
            id="announcement-kind"
            required
            value={submitterKind}
            onChange={(event) => setSubmitterKind(event.target.value)}
            placeholderOption="Select one"
            className={ENTRY_CONTROL}
          >
            {SUBMITTER_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FormSection>

      <FormSection title={<SectionTitle>2 · Announcement</SectionTitle>} className={SECTION_CLASS}>
        <RadioCards
          name="runOn"
          legend={
            <>
              Where should this run?
              <span aria-hidden className="ml-0.5 text-danger">
                *
              </span>
            </>
          }
          required
          columns={3}
          size="sm"
          value={runOn || null}
          onChange={setRunOn}
          options={RUN_ON_CARDS}
          className="[&_label]:min-h-10 md:[&_label]:min-h-9 pointer-coarse:[&_label]:min-h-10"
        />
        <Field
          label="Write your announcement"
          htmlFor="announcement-text"
          required
          hint={
            <span className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "font-mono-broadcast tabular-nums",
                  announcementLength > MAX_ANNOUNCEMENT_CHARS && "text-danger"
                )}
              >
                {announcementLength} / {MAX_ANNOUNCEMENT_CHARS}
              </span>
              <SubmitShortcutHint action="submit" />
            </span>
          }
        >
          <Textarea
            id="announcement-text"
            required
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value)}
            onKeyDown={onAnnouncementKeyDown}
            aria-describedby="announcement-text-hint"
            rows={6}
            className="resize-y"
            placeholder="Write the announcement as it should be read or posted."
          />
        </Field>
        <Field label="Photo or media Google Drive link" htmlFor="announcement-media">
          <Input
            id="announcement-media"
            type="url"
            value={mediaLink}
            onChange={(event) => setMediaLink(event.target.value)}
            className={ENTRY_CONTROL}
            placeholder="https://drive.google.com/..."
          />
        </Field>
        <Field label="Anything else we should know?" htmlFor="announcement-more">
          <Textarea
            id="announcement-more"
            value={moreInfo}
            onChange={(event) => setMoreInfo(event.target.value)}
            rows={3}
            className="resize-y"
          />
        </Field>
      </FormSection>

      <FormSection title={<SectionTitle>3 · When it runs</SectionTitle>} cols={2} className={SECTION_CLASS}>
        <Field label="Start date" htmlFor="announcement-start" required>
          <Input
            id="announcement-start"
            type="date"
            required
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className={ENTRY_CONTROL}
          />
        </Field>
        <Field label="End date" htmlFor="announcement-end" required>
          <Input
            id="announcement-end"
            type="date"
            required
            min={startDate || undefined}
            max={maxEndDate || undefined}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            aria-describedby="announcement-end-hint"
            className={ENTRY_CONTROL}
          />
        </Field>
        <p id="announcement-end-hint" className="text-[13px] text-muted-foreground sm:col-span-2">
          Maximum {MAX_SHOW_DAYS} consecutive show days
          {maxEndDateLabel ? ` (through ${maxEndDateLabel})` : ""}.
        </p>
      </FormSection>

      <FormSection title={<SectionTitle>4 · Submit</SectionTitle>} className={SECTION_CLASS}>
        <Checkbox
          checked={policyAgreed}
          onCheckedChange={setPolicyAgreed}
          required
          className="mt-0.5"
          labelClassName="items-start text-[13px] leading-snug"
        >
          I agree to the InFocus announcement policy. Announcements run for a maximum of four consecutive show days.
          InFocus students may accept, reject, or edit announcements for grammar, clarity, and unprotected speech.
        </Checkbox>
        {message ? (
          <Alert tone="danger" compact>
            {message}
          </Alert>
        ) : null}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-4">
          {!policyAgreed ? (
            <p className="text-[13px] text-muted-foreground md:mr-auto">Agree to the policy to submit.</p>
          ) : null}
          <Button
            type="submit"
            disabled={submitting || !policyAgreed}
            className={cn(ENTRY_CONTROL, "w-full md:w-auto")}
          >
            <Megaphone aria-hidden />
            {submitting ? "Submitting…" : "Submit announcement"}
          </Button>
        </div>
      </FormSection>
    </form>
  );

  if (compact) {
    return main;
  }

  // The rules come first in the page order (read before the form on phones), and sit in the
  // sticky rail beside the form from lg.
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
      <aside className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
        <AnnouncementRulesPanel />
      </aside>
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{main}</div>
    </div>
  );
}
