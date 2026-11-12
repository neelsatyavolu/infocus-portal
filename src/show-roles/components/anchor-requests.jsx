"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "./ui/simple-modal";
import { createAnchorRequest, loadAnchorRequests, updateAnchorRequest } from "../lib/anchor-requests-api";
import { formatReadableDate, parseDate } from "../lib/date";

function showLabel(dateKey) {
  return formatReadableDate(parseDate(dateKey));
}

function LateTag() {
  return (
    <span className="rounded-full border border-[rgb(242,165,22,0.3)] bg-[rgb(242,165,22,0.12)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-amber)]">
      Late notice
    </span>
  );
}

function describe(request) {
  return request.kind === "SWAP" ? `Swap with ${request.swapWithName}` : "Drop slot";
}

function RequestDialog({ open, onClose, showDate, mine, classmates, onCreated }) {
  const [kind, setKind] = useState("DROP");
  const [swapWithUserId, setSwapWithUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createAnchorRequest(
        kind === "SWAP" ? { kind, showDate, swapWithUserId, reason } : { kind, showDate, reason },
      );
      onCreated();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Can't anchor this show?" description={showLabel(showDate)}>
      <form className="space-y-4" onSubmit={submit}>
        {mine?.lateNotice ? (
          <p className="text-sm text-[var(--brand-amber)]">
            This show is less than 48 hours away, so the request will be marked as late notice.
          </p>
        ) : null}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">What do you need?</legend>
          {[
            ["DROP", "Drop my slot", "The show manager finds someone else."],
            ["SWAP", "Swap with a classmate", "They take your slot on this show."],
          ].map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="anchor-request-kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="mt-1"
              />
              <span>
                <span className="text-foreground">{label}</span>
                <span className="block text-[13px] text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {kind === "SWAP" ? (
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-foreground">Classmate</span>
            <select
              required
              value={swapWithUserId}
              onChange={(event) => setSwapWithUserId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-[var(--ink-2)] px-2 text-sm text-foreground"
            >
              <option value="">Pick someone</option>
              {classmates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-foreground">Reason (optional)</span>
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-md border border-input bg-[var(--ink-2)] px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || (kind === "SWAP" && !swapWithUserId)}>
            {busy ? "Sending…" : "Send request"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Anchor drop / swap requests on the generator: the selected show's anchor can ask, and producers
 * see every pending request with Approve / Deny. Renders nothing when neither applies.
 */
export function AnchorRequests({ showDate }) {
  const [state, setState] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    loadAnchorRequests(showDate)
      .then((data) => {
        if (cancelled) return;
        setState(data);
        setError("");
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Couldn't load anchor requests.");
      });
    return () => {
      cancelled = true;
    };
  }, [showDate, reloadKey]);

  async function act(id, action) {
    setBusyId(id);
    setError("");
    try {
      await updateAnchorRequest(id, action);
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Couldn't update the request.");
    } finally {
      setBusyId("");
    }
  }

  if (!state) {
    return error ? <p role="alert" className="text-sm text-danger">{error}</p> : null;
  }

  const requests = state.requests ?? [];
  const myPending = requests.find(
    (request) => request.userId === state.viewerId && request.showDate === showDate && request.status === "PENDING",
  );
  const canAsk = Boolean(state.mine?.anchoring && state.mine?.upcoming && !myPending);
  const toDecide = state.canDecide
    ? requests.filter((request) => request.status === "PENDING" && request.userId !== state.viewerId)
    : [];

  if (!canAsk && !myPending && toDecide.length === 0 && !error) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card px-5 py-4" aria-label="Anchor requests">
      {canAsk ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">You&apos;re anchoring this show.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            Can&apos;t make it?
          </Button>
        </div>
      ) : null}
      {myPending ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            Your request ({describe(myPending).toLowerCase()}) is waiting for a producer.
            {myPending.lateNotice ? <LateTag /> : null}
          </p>
          <Button
            type="button"
            variant="destructive-quiet"
            size="sm"
            disabled={busyId === myPending.id}
            onClick={() => act(myPending.id, "cancel")}
          >
            Withdraw
          </Button>
        </div>
      ) : null}
      {toDecide.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Anchor requests ({toDecide.length})</h3>
          <ul className="divide-y divide-border">
            {toDecide.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-foreground">
                    <span>
                      {request.requesterName} · {describe(request)} · {showLabel(request.showDate)}
                    </span>
                    {request.lateNotice ? <LateTag /> : null}
                  </div>
                  {request.reason ? <p className="text-[13px] text-muted-foreground">{request.reason}</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive-quiet"
                    size="sm"
                    disabled={busyId === request.id}
                    onClick={() => act(request.id, "deny")}
                  >
                    Deny
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === request.id}
                    onClick={() => act(request.id, "approve")}
                  >
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <RequestDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        showDate={showDate}
        mine={state.mine}
        classmates={state.classmates ?? []}
        onCreated={refresh}
      />
    </section>
  );
}
