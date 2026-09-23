"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { matchingEquipmentItems, type EquipmentItemSuggestion } from "@/src/lib/equipment-item-suggestions";
import { cn } from "@/src/lib/utils";

type Status = { type: "error" | "success" | "info"; text: string } | null;

type CheckoutResult = {
  action: "checkout" | "return";
  item?: { name?: string | null };
};

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) {
    const error = new Error(body?.error?.message || "Request failed") as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return body?.data as T;
}

function FormMessage({ status }: { status: Status }) {
  if (!status?.text) {
    return null;
  }
  const color =
    status.type === "error"
      ? "border-[rgb(225,29,44,0.4)] bg-[rgb(225,29,44,0.12)] text-[var(--brand-red)]"
      : status.type === "success"
        ? "border-[rgb(0,199,44,0.3)] bg-[rgb(0,199,44,0.12)] text-[var(--brand-green)]"
        : "border-border bg-card text-muted-foreground";
  return <p className={cn("rounded-md border px-3 py-2 text-sm", color)}>{status.text}</p>;
}

export default function EquipmentCheckoutClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [barcode, setBarcode] = useState("");
  const itemCodeRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<EquipmentItemSuggestion[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [tookSdCard, setTookSdCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function checkSession() {
      try {
        const data = await readJson<{ unlocked: boolean; remainingMs?: number }>(await fetch("/api/equipment/kiosk/session", { cache: "no-store" }));
        if (!active) return;
        clearTimeout(timer);
        setUnlocked(data.unlocked);
        if (data.unlocked) {
          timer = setTimeout(() => {
            setUnlocked(false);
            setBarcodes([]);
            setBarcode("");
            setTookSdCard(false);
            setStatus({ type: "info", text: "Your one-hour checkout session ended. Sign in with Google again." });
          }, data.remainingMs ?? 0);
        }
      } catch {
        if (active) {
          setUnlocked(false);
          setStatus({ type: "error", text: "Could not check the checkout session. Reload to try again." });
        }
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    const error = new URLSearchParams(window.location.search).get("signInError");
    if (error) setStatus({ type: "error", text: error === "not_manager" ? "This Google account is not an equipment manager or producer." : "Google sign-in could not be completed. Please try again." });
    void checkSession();
    window.addEventListener("focus", checkSession);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("focus", checkSession);
    };
  }, [sessionRefresh]);

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
      }).catch(() => {
        if (active) setItemsError(true);
      }).finally(() => {
        if (active) setItemsLoading(false);
      });
    return () => { active = false; };
  }, [unlocked]);

  const suggestions = matchingEquipmentItems(items, barcode, barcodes);
  const selectedItem = items.find((item) => item.barcode === barcode.trim());

  function addItemCode() {
    const code = barcode.trim();
    if (!code || busy) return;
    if (barcodes.includes(code)) {
      setStatus({ type: "error", text: "That item code is already in the list." });
      return;
    }
    if (barcodes.length >= 50) {
      setStatus({ type: "error", text: "Submit up to 50 items at a time." });
      return;
    }
    setBarcodes((current) => [...current, code]);
    setBarcode("");
    setStatus(null);
  }

  async function submitCheckout(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const data = await readJson<{ results: CheckoutResult[] }>(
        await fetch("/api/equipment/kiosk/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: studentName.trim(),
            studentEmail: studentEmail.trim(),
            barcodes: barcode.trim() ? [...barcodes, barcode.trim()] : barcodes,
            tookSdCard
          })
        })
      );
      const summary = data.results.map((result) =>
        `${result.action === "return" ? "Returned" : "Checked out"} ${result.item?.name?.trim() || "item"}.`
      ).join(" ");
      setStatus({ type: "success", text: `${summary}${tookSdCard ? " SD card recorded for this batch." : ""}` });
      setBarcode("");
      setBarcodes([]);
      setTookSdCard(false);
    } catch (error) {
      const statusCode = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      if (statusCode === 401 || statusCode === 403) {
        setUnlocked(false);
        setStatus({ type: "error", text: "Checkout locked. Sign in with your manager Google account." });
      } else {
        setStatus({ type: "error", text: error instanceof Error ? error.message : "Checkout failed." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function lockStation() {
    setBarcodes([]);
    setBarcode("");
    setTookSdCard(false);
    setBusy(true);
    setStatus(null);
    try {
      await readJson(await fetch("/api/equipment/kiosk/lock", { method: "POST" }));
      setUnlocked(false);
      setSessionRefresh((value) => value + 1);
      setStatus({ type: "info", text: "Checkout locked. Your main Portal session is unchanged." });
    } catch (error) {
      setUnlocked(false);
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not lock." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-black uppercase italic tracking-tight text-foreground">Checkout</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter your name and email, then add item codes to check equipment in or out together.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Checkout station</CardTitle>
          <CardDescription>Use the same student email and item code to return an item.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!unlocked ? (
            <div className="max-w-md space-y-4">
              <p className="text-sm text-muted-foreground">An equipment manager or producer must sign in with their Portal Google account. Checkout locks automatically one hour after sign-in. This session is separate from the main Portal.</p>
              {checkingSession ? <p role="status" className="text-sm text-muted-foreground">Checking checkout session…</p> : (
                <a href="/api/auth/google/start?equipment=1" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Sign in with Google to unlock checkout</a>
              )}
            </div>
          ) : (
            <form className="space-y-5" onSubmit={submitCheckout}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="student-name">Student Name</Label>
                  <Input
                    id="student-name"
                    value={studentName}
                    onChange={(event) => {
                      setStudentName(event.target.value);
                      setTookSdCard(false);
                    }}
                    disabled={busy}
                    placeholder="Full name"
                    maxLength={200}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-email">Student Email</Label>
                  <Input
                    id="student-email"
                    type="email"
                    value={studentEmail}
                    onChange={(event) => {
                      setStudentEmail(event.target.value);
                      setTookSdCard(false);
                    }}
                    disabled={busy}
                    placeholder="student@pausd.us"
                    autoComplete="off"
                    maxLength={254}
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="item-code">Item code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="item-code"
                      ref={itemCodeRef}
                      value={barcode}
                      onChange={(event) => {
                        setBarcode(event.target.value);
                        setSuggestionsOpen(true);
                      }}
                      onFocus={() => setSuggestionsOpen(true)}
                      aria-describedby={selectedItem ? "selected-item-name item-code-help" : "item-code-help"}
                      placeholder="Scan code or search by code/name"
                      autoComplete="off"
                      disabled={busy}
                      required={barcodes.length === 0}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setSuggestionsOpen(false);
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addItemCode();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addItemCode} disabled={busy || !barcode.trim()}>
                      Add
                    </Button>
                  </div>
                  {selectedItem ? <p id="selected-item-name" className="text-xs text-muted-foreground">{selectedItem.name}</p> : null}
                  <p id="item-code-help" className="text-xs text-muted-foreground">Type a code or item name, select a match, then Add.</p>
                  {suggestionsOpen && barcode.trim() && !busy ? (
                    <div className="rounded-md border border-border bg-card">
                      {itemsLoading || itemsError || suggestions.length === 0 ? (
                        <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
                          {itemsLoading ? "Loading item codes…" : itemsError ? "Suggestions unavailable. You can still scan or enter an exact code." : "No matching items. Check the code or item name; already-added items are hidden."}
                        </p>
                      ) : (
                        <ul aria-label="Matching item codes" className="max-h-56 overflow-y-auto py-1">
                          {suggestions.map((item) => (
                            <li key={item.id}>
                              <button type="button" className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => {
                                setBarcode(item.barcode);
                                itemCodeRef.current?.focus();
                                setSuggestionsOpen(false);
                              }}>
                                <span className="break-all font-mono text-sm text-foreground">{item.barcode}</span>
                                <span className="break-words text-xs text-muted-foreground">{item.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              {barcodes.length > 0 ? (
                <ul className="space-y-2" aria-label="Items to submit">
                  {barcodes.map((code) => (
                    <li key={code} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="break-all font-mono text-sm">{code}</p>
                        <p className="break-words text-xs text-muted-foreground">{items.find((item) => item.barcode === code)?.name}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${code}`}
                        disabled={busy}
                        onClick={() => setBarcodes((current) => current.filter((entry) => entry !== code))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm" htmlFor="took-sd-card">
                  <input
                    id="took-sd-card"
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--brand-green)]"
                    checked={tookSdCard}
                    onChange={(event) => setTookSdCard(event.target.checked)}
                    disabled={busy}
                    aria-describedby="sd-card-help"
                  />
                  I took an SD card
                </label>
                <p id="sd-card-help" className="text-xs text-muted-foreground">
                  Check only when taking an SD card with this batch. No item code needed for the card.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || (barcodes.length === 0 && !barcode.trim())}>
                  {busy ? "Submitting…" : `Submit ${barcodes.length + (barcode.trim() ? 1 : 0)} item(s)`}
                </Button>
                <Button type="button" variant="outline" onClick={() => void lockStation()} disabled={busy}>
                  Lock
                </Button>
              </div>
            </form>
          )}
          <FormMessage status={status} />
        </CardContent>
      </Card>
    </div>
  );
}
