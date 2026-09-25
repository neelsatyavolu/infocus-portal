"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/src/lib/utils";

type Status = { type: "error" | "success" | "info"; text: string } | null;

type PublicItem = {
  id: string;
  name: string;
  barcode: string;
};

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) {
    throw new Error(body?.error?.message || "Request failed");
  }
  return body?.data as T;
}

function FormMessage({ status }: { status: Status }) {
  if (!status?.text) {
    return null;
  }
  const color =
    status.type === "error"
      ? "border-[rgb(238,58,42,0.4)] bg-[rgb(238,58,42,0.12)] text-[var(--brand-red)]"
      : status.type === "success"
        ? "border-[rgb(43,179,110,0.3)] bg-[rgb(43,179,110,0.12)] text-[var(--brand-green)]"
        : "border-border bg-card text-muted-foreground";
  return <p className={cn("rounded-md border px-3 py-2 text-sm", color)}>{status.text}</p>;
}

export default function EquipmentRequestClient() {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [selectedBarcodes, setSelectedBarcodes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ studentName: "", studentId: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await readJson<{ items: PublicItem[] }>(await fetch("/api/equipment/public/items"));
        if (mounted) {
          setItems(data.items ?? []);
        }
      } catch (error) {
        if (mounted) {
          setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not load items." });
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter(
      (item) => item.name.toLowerCase().includes(query) || item.barcode.toLowerCase().includes(query)
    );
  }, [items, search]);

  function toggleBarcode(barcode: string) {
    setSelectedBarcodes((prev) => (prev.includes(barcode) ? prev.filter((entry) => entry !== barcode) : [...prev, barcode]));
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (selectedBarcodes.length === 0) {
      setStatus({ type: "error", text: "Select at least one item." });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      await readJson(
        await fetch("/api/equipment/public/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: form.studentName.trim(),
            studentId: form.studentId.trim(),
            email: form.email.trim(),
            barcodes: selectedBarcodes
          })
        })
      );
      setStatus({ type: "success", text: "Request submitted." });
      setSelectedBarcodes([]);
      setForm({ studentName: "", studentId: "", email: "" });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Could not submit request." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-black uppercase italic tracking-tight text-foreground">Request</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ask for available equipment. A manager will approve or deny.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipment request</CardTitle>
          <CardDescription>Name, student ID, email, and one or more items.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={submitRequest}>
            <div className="space-y-2">
              <Label htmlFor="request-name">Name</Label>
              <Input
                id="request-name"
                value={form.studentName}
                onChange={(event) => setForm((prev) => ({ ...prev, studentName: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-student">Student ID</Label>
              <Input
                id="request-student"
                value={form.studentId}
                onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-email">Email</Label>
              <Input
                id="request-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="request-search">Find equipment</Label>
              <Input
                id="request-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or code"
              />
            </div>

            <div className="space-y-2 sm:col-span-3">
              <Label>Selected items</Label>
              <div className="flex min-h-14 flex-wrap gap-2 rounded-lg border border-border bg-card p-3">
                {selectedBarcodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items selected.</p>
                ) : (
                  selectedBarcodes.map((barcode) => {
                    const item = items.find((entry) => entry.barcode === barcode);
                    return (
                      <Badge key={barcode} variant="secondary" className="gap-2">
                        {item ? `${item.name} · ${item.barcode}` : barcode}
                        <button type="button" className="text-xs" onClick={() => toggleBarcode(barcode)}>
                          ×
                        </button>
                      </Badge>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <Button type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit request"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSelectedBarcodes([])}>
                Clear items
              </Button>
            </div>
          </form>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Available equipment</h3>
            <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Item
                    </th>
                    <th className="px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Code
                    </th>
                    <th className="px-3 py-2 text-right font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No available items.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const selected = selectedBarcodes.includes(item.barcode);
                      return (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-foreground">{item.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.barcode}</td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant={selected ? "secondary" : "outline"} type="button" onClick={() => toggleBarcode(item.barcode)}>
                              {selected ? "Selected" : "Add"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <FormMessage status={status} />
        </CardContent>
      </Card>
    </div>
  );
}
