"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Clock, Lock, LockOpen } from "lucide-react";
import { MainWithRail } from "@/components/kit/layout";
import { LoadingRegion, PanelSkeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { StickyActionBar } from "@/components/kit/sticky-action-bar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { isSubmitShortcut } from "@/components/ui/submit-shortcut";
import { errorStatus, errorText, readJson, sendJson, type FormStatus } from "@/components/equipment/equipment-api";
import { formatTime, itemCountLabel } from "@/components/equipment/equipment-status";
import { StatusAlert, StatusLine } from "@/components/equipment/status-alert";
import { ABOVE_PHONE_TABBAR } from "@/components/equipment/sticky-bar";
import { matchingEquipmentItems, type EquipmentItemSuggestion } from "@/src/lib/equipment-item-suggestions";
import { CheckoutBatchPanel, submitLabel } from "./_components/checkout-batch-panel";
import { CheckoutLockedPanel } from "./_components/checkout-locked-panel";
import { CheckoutScanPanel } from "./_components/checkout-scan-panel";
import { useCheckoutSession } from "./_components/use-checkout-session";

type CheckoutResult = {
  action: "checkout" | "return";
  item?: { name?: string | null };
};

const FORM_ID = "equipment-checkout-form";
const MAX_ITEMS = 50;

function signInErrorText(code: string) {
  return code === "not_manager"
    ? "This Google account is not an equipment manager or producer."
    : "Google sign-in could not be completed. Please try again.";
}

/** The header's session tag: Checking, Locked, Unlocked · locks 3:42 PM (amber in the last ten minutes). */
function SessionTag({ unlocked, checking, lockSoon, lockTime }: { unlocked: boolean; checking: boolean; lockSoon: boolean; lockTime: string }) {
  if (unlocked) {
    return lockSoon ? (
      <StatusTag tone="warning" icon={Clock} title={`Checkout locks at ${lockTime}`}>
        Locks {lockTime}
      </StatusTag>
    ) : (
      <StatusTag tone="success" icon={LockOpen} title={`Checkout locks at ${lockTime}`}>
        Unlocked · locks {lockTime}
      </StatusTag>
    );
  }
  return checking ? (
    <StatusTag tone="neutral" spinner>
      Checking
    </StatusTag>
  ) : (
    <StatusTag tone="neutral" icon={Lock}>
      Locked
    </StatusTag>
  );
}

export default function EquipmentCheckoutClient() {
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [barcode, setBarcode] = useState("");
  const itemCodeRef = useRef<HTMLInputElement>(null);
  const refocusCode = useRef(false);
  const [items, setItems] = useState<EquipmentItemSuggestion[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [tookSdCard, setTookSdCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatus>(null);

  function clearBatch() {
    setBarcodes([]);
    setBarcode("");
    setTookSdCard(false);
  }

  const session = useCheckoutSession({
    onExpire: () => {
      clearBatch();
      setStatus({ type: "info", text: "Your one-hour checkout session ended. Sign in with Google again." });
    },
    onCheckFailed: () => setStatus({ type: "error", text: "Could not check the checkout session. Reload to try again." })
  });
  const { unlocked } = session;

  // A Google sign-in error comes back once in the URL. Read it, then drop it, so a later Lock
  // message is never overwritten by the stale error.
  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("signInError");
    if (!error) return;
    setStatus({ type: "error", text: signInErrorText(error) });
    url.searchParams.delete("signInError");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setItems([]);
      return;
    }
    let active = true;
    setItemsLoading(true);
    setItemsError(false);
    fetch("/api/equipment/kiosk/items", { cache: "no-store" })
      .then((response) => readJson<{ items: EquipmentItemSuggestion[] }>(response))
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch(() => {
        if (active) setItemsError(true);
      })
      .finally(() => {
        if (active) setItemsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unlocked]);

  // After Add or a successful submit, put the cursor back in Item code for the next scan (once
  // the field is enabled again).
  useEffect(() => {
    if (busy || !refocusCode.current) return;
    refocusCode.current = false;
    itemCodeRef.current?.focus();
  }, [busy, barcodes]);

  const suggestions = matchingEquipmentItems(items, barcode, barcodes);
  const selectedItem = items.find((item) => item.barcode === barcode.trim());
  const submitCount = barcodes.length + (barcode.trim() ? 1 : 0);

  function editStudent(update: () => void) {
    update();
    setTookSdCard(false);
  }

  function addItemCode() {
    const code = barcode.trim();
    if (!code || busy) return;
    if (barcodes.includes(code)) {
      setStatus({ type: "error", text: "That item code is already in the list." });
      return;
    }
    if (barcodes.length >= MAX_ITEMS) {
      setStatus({ type: "error", text: "Submit up to 50 items at a time." });
      return;
    }
    refocusCode.current = true;
    setBarcodes((current) => [...current, code]);
    setBarcode("");
    setStatus(null);
  }

  async function submitCheckout(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const data = await sendJson<{ results: CheckoutResult[] }>("/api/equipment/kiosk/checkout", "POST", {
        studentName: studentName.trim(),
        studentEmail: studentEmail.trim(),
        barcodes: barcode.trim() ? [...barcodes, barcode.trim()] : barcodes,
        tookSdCard
      });
      const summary = data.results
        .map((result) => `${result.action === "return" ? "Returned" : "Checked out"} ${result.item?.name?.trim() || "item"}.`)
        .join(" ");
      setStatus({ type: "success", text: `${summary}${tookSdCard ? " SD card recorded for this batch." : ""}` });
      refocusCode.current = true;
      clearBatch();
    } catch (error) {
      const code = errorStatus(error);
      if (code === 401 || code === 403) {
        session.markLocked();
        setStatus({ type: "error", text: "Checkout locked. Sign in with your manager Google account." });
      } else {
        setStatus({ type: "error", text: errorText(error, "Checkout failed.") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function lockStation() {
    clearBatch();
    setBusy(true);
    setStatus(null);
    try {
      await readJson(await fetch("/api/equipment/kiosk/lock", { method: "POST" }));
      session.markLocked();
      session.recheck();
      setStatus({ type: "info", text: "Checkout locked. Your main Portal session is unchanged." });
    } catch (error) {
      session.markLocked();
      setStatus({ type: "error", text: errorText(error, "Could not lock.") });
    } finally {
      setBusy(false);
    }
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    if (!busy && submitCount > 0) event.currentTarget.requestSubmit();
  }

  let body;
  if (unlocked) {
    body = (
      <>
        <form id={FORM_ID} onSubmit={submitCheckout} onKeyDown={onFormKeyDown} className="min-w-0">
          <MainWithRail
            breakpoint="lg"
            stickyRail
            rail={
              <CheckoutBatchPanel
                listed={barcodes.length}
                submitCount={submitCount}
                tookSdCard={tookSdCard}
                onTookSdCardChange={setTookSdCard}
                status={status}
                busy={busy}
              />
            }
          >
            <CheckoutScanPanel
              studentName={studentName}
              studentEmail={studentEmail}
              onStudentNameChange={(value) => editStudent(() => setStudentName(value))}
              onStudentEmailChange={(value) => editStudent(() => setStudentEmail(value))}
              code={barcode}
              onCodeChange={setBarcode}
              codeRef={itemCodeRef}
              suggestionsOpen={suggestionsOpen}
              onSuggestionsOpenChange={setSuggestionsOpen}
              suggestions={suggestions}
              suggestionState={itemsLoading ? "loading" : itemsError ? "error" : "ready"}
              selectedItemName={selectedItem?.name ?? null}
              listed={barcodes}
              items={items}
              onAdd={addItemCode}
              onRemove={(code) => setBarcodes((current) => current.filter((entry) => entry !== code))}
              busy={busy}
            />
          </MainWithRail>
        </form>
        {/* Phones: the result shows beside Submit, so it is never below the fold. */}
        <StickyActionBar
          reserveLauncher={false}
          className={`lg:hidden ${ABOVE_PHONE_TABBAR}`}
          status={status ? <StatusLine status={status} /> : `${itemCountLabel(barcodes.length)} listed · up to 50`}
        >
          <Button type="submit" form={FORM_ID} disabled={busy || submitCount === 0}>
            {submitLabel(busy, submitCount)}
          </Button>
        </StickyActionBar>
      </>
    );
  } else if (session.checking) {
    // A neutral outline of the station while the session is checked (it may already be unlocked).
    body = (
      <LoadingRegion label="Checking checkout session">
        <MainWithRail breakpoint="lg" rail={<PanelSkeleton rows={3} />}>
          <PanelSkeleton rows={4} />
        </MainWithRail>
      </LoadingRegion>
    );
  } else {
    body = (
      <>
        <StatusAlert status={status} onDismiss={() => setStatus(null)} />
        <CheckoutLockedPanel />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Equipment"
        status={
          <SessionTag
            unlocked={unlocked}
            checking={session.checking}
            lockSoon={session.lockSoon}
            lockTime={formatTime(session.expiresAt)}
          />
        }
        title="Checkout"
        description="Scan items to check them out or back in. The same student email and code returns an item."
        actions={
          unlocked ? (
            <Button type="button" variant="outline" onClick={() => void lockStation()} disabled={busy}>
              <Lock aria-hidden />
              Lock
            </Button>
          ) : undefined
        }
      />
      {body}
    </div>
  );
}
