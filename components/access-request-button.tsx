"use client";

import { useState, type ReactNode } from "react";
import { Alert, InlineNote } from "@/components/kit/alert";
import { KeyValueList } from "@/components/kit/key-value";
import { StatusTag } from "@/components/kit/status-tag";
import { ENTRY_CONTROL, EntryPanel } from "@/components/public-entry/entry-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

type AccessRequestButtonProps = {
  email: string | null;
  name: string | null;
  /** The panel footer: a note and the page's way out (Sign out / Back home). */
  footer?: ReactNode;
};

/**
 * The Request access button, now drawn as the whole "Request access" panel on /access-denied:
 * what will be sent, the button, and the result. (The name is kept for its one importer.)
 */
export function AccessRequestButton({ email, name, footer }: AccessRequestButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // The API approves an email that is already on Portal at once (`alreadyAllowed`), so no email follows.
  const [alreadyAllowed, setAlreadyAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRequestAccess() {
    if (!email || submitting || submitted) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/platform/access-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          name
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Failed to send request.");
      }

      setAlreadyAllowed(payload?.data?.alreadyAllowed === true);
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to send request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <EntryPanel
      id="access-request"
      title="Request access"
      status={submitted ? <StatusTag tone="success">{alreadyAllowed ? "Approved" : "Requested"}</StatusTag> : undefined}
      footer={footer}
    >
      {!email ? (
        <InlineNote>
          We couldn’t find an email for this session. Sign in again, then request access.
        </InlineNote>
      ) : (
        <>
          <KeyValueList
            layout="stacked"
            items={[
              { label: "Email", value: email },
              { label: "Name", value: name, hidden: !name }
            ]}
          />
          {error ? <Alert tone="danger" compact>{error}</Alert> : null}
          {submitted ? (
            <Alert tone="success" compact>
              {alreadyAllowed
                ? "Your email is already on InFocus Portal. Ask a producer if you need this page."
                : "Request sent. We’ll email you once it’s approved."}
            </Alert>
          ) : (
            <Button
              type="button"
              variant="default"
              className={cn(ENTRY_CONTROL, "w-full")}
              onClick={() => void onRequestAccess()}
              disabled={submitting}
            >
              {submitting ? "Requesting…" : "Request access"}
            </Button>
          )}
        </>
      )}
    </EntryPanel>
  );
}
