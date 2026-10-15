"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MainWithRail } from "@/components/kit/layout";
import { StickyActionBar } from "@/components/kit/sticky-action-bar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { errorText, readJson, sendJson, type FormStatus } from "@/components/equipment/equipment-api";
import { StatusLine } from "@/components/equipment/status-alert";
import { ABOVE_PHONE_TABBAR } from "@/components/equipment/sticky-bar";
import { RequestCatalog, type PublicItem } from "./_components/request-catalog";
import { REQUEST_FORM_ID, RequestPanel, type RequestFields } from "./_components/request-panel";

const EMPTY_FORM: RequestFields = { studentName: "", studentId: "", email: "" };

export default function EquipmentRequestClient() {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedBarcodes, setSelectedBarcodes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<RequestFields>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatus>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoadError(null);
      try {
        const data = await readJson<{ items: PublicItem[] }>(await fetch("/api/equipment/public/items"));
        if (mounted) {
          setItems(data.items ?? []);
          setLoaded(true);
        }
      } catch (error) {
        if (mounted) setLoadError(errorText(error, "Could not load items."));
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query) || item.barcode.toLowerCase().includes(query));
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
      await sendJson("/api/equipment/public/requests", "POST", {
        studentName: form.studentName.trim(),
        studentId: form.studentId.trim(),
        email: form.email.trim(),
        barcodes: selectedBarcodes
      });
      setStatus({ type: "success", text: "Request submitted." });
      setSelectedBarcodes([]);
      setForm(EMPTY_FORM);
    } catch (error) {
      setStatus({ type: "error", text: errorText(error, "Could not submit request.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Equipment"
        title="Request equipment"
        description="Pick available gear and send it to a manager. Approved items are held for you."
      />

      <MainWithRail
        breakpoint="lg"
        stickyRail
        rail={
          <RequestPanel
            items={items}
            selected={selectedBarcodes}
            onRemove={toggleBarcode}
            onClear={() => setSelectedBarcodes([])}
            form={form}
            onFormChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
            onSubmit={submitRequest}
            status={status}
            busy={busy}
          />
        }
      >
        <RequestCatalog
          items={items}
          filteredItems={filteredItems}
          loaded={loaded}
          loadError={loadError}
          onRetry={() => setReloadKey((value) => value + 1)}
          search={search}
          onSearchChange={setSearch}
          selected={selectedBarcodes}
          onToggle={toggleBarcode}
        />
      </MainWithRail>

      {/* Phones: the result shows beside Submit, so it is never below the fold. */}
      <StickyActionBar
        reserveLauncher={false}
        className={`lg:hidden ${ABOVE_PHONE_TABBAR}`}
        status={status ? <StatusLine status={status} /> : `${selectedBarcodes.length} selected`}
      >
        <Button type="submit" form={REQUEST_FORM_ID} disabled={busy}>
          {busy ? "Submitting…" : "Submit request"}
        </Button>
      </StickyActionBar>
    </div>
  );
}
