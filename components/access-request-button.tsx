"use client";

import { useState } from "react";

type AccessRequestButtonProps = {
  email: string | null;
  name: string | null;
};

export function AccessRequestButton({ email, name }: AccessRequestButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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

      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to send request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!email) {
    return (
      <p className="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        We could not detect an account email for this session. Sign in again and try requesting access.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void onRequestAccess()}
        disabled={submitting || submitted}
        className="rounded-lg border border-border bg-accent px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60"
      >
        {submitted ? "Access Requested" : submitting ? "Requesting..." : "Request Access"}
      </button>
      {submitted ? (
        <p className="mt-2 text-sm text-emerald-200">
          Request sent. You will be sent an email once your request is approved.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
