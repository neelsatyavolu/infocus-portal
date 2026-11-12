"use client";

import { useEffect, useState, type FormEvent } from "react";
import { InlineError } from "@/components/kit/alert";
import { Field } from "@/components/kit/field";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { DaySection } from "@/components/master-calendar/day-sections";

type Kind = "DROP" | "SWAP";

type RequestRow = {
  id: string;
  showDate: string;
  kind: Kind;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";
  lateNotice: boolean;
  userId: string;
  swapWithName: string | null;
};

type RequestsState = {
  viewerId: string;
  mine: { anchoring: boolean; lateNotice: boolean; upcoming: boolean } | null;
  classmates: Array<{ id: string; name: string }>;
  requests: RequestRow[];
};

const ENDPOINT = "/api/show-roles/anchor-requests";
const CONTROL = "w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground";

async function send(method: "GET" | "POST" | "PATCH", body?: unknown, query = "") {
  const response = await fetch(`${ENDPOINT}${query}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "Something went wrong. Try again.");
  return payload?.data;
}

/**
 * Day panel, show days: the viewer's own anchor slot. An anchor on an upcoming show can ask to drop
 * it or swap with a classmate; a pending request shows its status and can be withdrawn.
 * Renders nothing for anyone not anchoring that show.
 */
export function AnchorSlotRequest({ showDate }: { showDate: string }) {
  const [state, setState] = useState<RequestsState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("DROP");
  const [swapWithUserId, setSwapWithUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    send("GET", undefined, `?date=${encodeURIComponent(showDate)}`)
      .then((data: RequestsState) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        // Optional extra on the panel: a failed load just hides it.
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showDate, reloadKey]);

  if (!state) return null;
  const pending = state.requests.find(
    (request) => request.userId === state.viewerId && request.showDate === showDate && request.status === "PENDING"
  );
  const canAsk = Boolean(state.mine?.anchoring && state.mine.upcoming);
  if (!pending && !canAsk) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(false);
      setReason("");
      setSwapWithUserId("");
      setReloadKey((key) => key + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() =>
      send("POST", kind === "SWAP" ? { kind, showDate, swapWithUserId, reason } : { kind, showDate, reason })
    );
  }

  return (
    <DaySection label="Your anchor slot">
      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            {pending.kind === "SWAP" ? `Swap with ${pending.swapWithName ?? "a classmate"}` : "Drop request"}
            <StatusTag tone="warn">Pending</StatusTag>
            {pending.lateNotice ? <StatusTag tone="caution">Late notice</StatusTag> : null}
          </p>
          <Button type="button" variant="destructive-quiet" size="sm" disabled={busy} onClick={() => void run(() => send("PATCH", { id: pending.id, action: "cancel" }))}>
            Withdraw
          </Button>
        </div>
      ) : open ? (
        <form className="space-y-3" onSubmit={submit}>
          {state.mine?.lateNotice ? (
            <p className="text-[13px] leading-snug text-[var(--brand-amber)]">
              This show is less than 48 hours away, so the request will be marked as late notice.
            </p>
          ) : null}
          <SegmentedControl<Kind>
            ariaLabel="Request type"
            value={kind}
            onChange={setKind}
            size="sm"
            fullWidth
            options={[
              { value: "DROP", label: "Drop my slot" },
              { value: "SWAP", label: "Swap" }
            ]}
          />
          {kind === "SWAP" ? (
            <Field label="Classmate" htmlFor="anchor-swap-with" required>
              <select
                id="anchor-swap-with"
                required
                value={swapWithUserId}
                onChange={(event) => setSwapWithUserId(event.target.value)}
                className={`${CONTROL} h-9`}
              >
                <option value="">Pick someone</option>
                {state.classmates.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Reason" htmlFor="anchor-request-reason" hint="Optional. A producer approves or denies the request.">
            <textarea
              id="anchor-request-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={`${CONTROL} py-2`}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || (kind === "SWAP" && !swapWithUserId)}>
              {busy ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">You&apos;re anchoring this show.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            Can&apos;t make it?
          </Button>
        </div>
      )}
      {error ? <InlineError>{error}</InlineError> : null}
    </DaySection>
  );
}
