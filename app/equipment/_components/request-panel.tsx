"use client";

import type { FormEvent } from "react";
import { ClipboardList, X } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormStatus } from "@/components/equipment/equipment-api";
import { StatusAlert } from "@/components/equipment/status-alert";
import type { PublicItem } from "./request-catalog";

export const REQUEST_FORM_ID = "equipment-request-form";

export type RequestFields = {
  studentName: string;
  studentId: string;
  email: string;
};

const FIELD = "h-10 md:h-9";

/**
 * "Your request": the picked items, who is asking, and Submit. The sticky rail beside the catalog
 * on desktop: never taller than the screen, the picked list and fields scroll inside it, and the
 * result and Submit stay pinned at its foot, so they are in view on short laptop screens. Under
 * the catalog on phones, where Submit moves to the StickyActionBar.
 */
export function RequestPanel({
  items,
  selected,
  onRemove,
  onClear,
  form,
  onFormChange,
  onSubmit,
  status,
  busy
}: {
  items: PublicItem[];
  selected: string[];
  onRemove: (barcode: string) => void;
  onClear: () => void;
  form: RequestFields;
  onFormChange: (field: keyof RequestFields, value: string) => void;
  onSubmit: (event: FormEvent) => void;
  status: FormStatus;
  busy: boolean;
}) {
  return (
    <Panel
      id="your-request"
      title="Your request"
      titleAs="h2"
      count={selected.length}
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={selected.length === 0}>
          Clear items
        </Button>
      }
      padding="none"
      className="lg:max-h-[calc(100dvh-var(--app-header-h,0px)-2rem)]"
      bodyClassName="flex flex-col lg:min-h-0"
    >
      <form id={REQUEST_FORM_ID} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 p-4 md:p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {selected.length === 0 ? (
            <div className="rounded-md border border-border">
              <EmptyState size="inline" icon={ClipboardList} title="No items selected." description="Add gear from the list." />
            </div>
          ) : (
            <ul
              aria-label="Selected items"
              className="divide-y divide-border overflow-hidden rounded-md border border-border"
            >
              {selected.map((barcode) => {
                const item = items.find((entry) => entry.barcode === barcode);
                const label = item ? item.name : barcode;
                return (
                  <li key={barcode} className="flex min-h-12 items-center gap-3 py-1.5 pl-3 pr-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-foreground">{label}</p>
                      {item ? (
                        <p className="break-all font-mono text-xs tabular-nums text-muted-foreground">{item.barcode}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 max-md:h-10 max-md:w-10"
                      aria-label={`Remove ${label}`}
                      onClick={() => onRemove(barcode)}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2">
            <Label htmlFor="request-name">Name</Label>
            <Input
              id="request-name"
              value={form.studentName}
              onChange={(event) => onFormChange("studentName", event.target.value)}
              autoComplete="name"
              required
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-student">Student ID</Label>
            <Input
              id="request-student"
              value={form.studentId}
              onChange={(event) => onFormChange("studentId", event.target.value)}
              required
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-email">Email</Label>
            <Input
              id="request-email"
              type="email"
              value={form.email}
              onChange={(event) => onFormChange("email", event.target.value)}
              autoComplete="email"
              required
              className={FIELD}
            />
          </div>

          {/* Phones: the result shows here (and, as a short line, beside Submit in the action bar). */}
          <StatusAlert status={status} compact className="lg:hidden" />
        </div>

        <div className="hidden shrink-0 space-y-3 border-t border-border p-4 md:p-5 lg:block">
          <StatusAlert status={status} compact />
          <Button type="submit" className="h-10 w-full" disabled={busy}>
            {busy ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
