"use client";

import type { RefObject } from "react";
import { Plus, ScanBarcode, X } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuggestionCombobox, type SuggestionState } from "@/components/equipment/suggestion-combobox";
import type { EquipmentItemSuggestion } from "@/src/lib/equipment-item-suggestions";

/** Phones get 40px controls (16px text already comes from Input); 36px from md. */
const FIELD = "h-10 md:h-9";

/**
 * Who is borrowing, the scan field, and the items listed so far (point-of-sale style: each
 * scanned item lands right under the field, so this column grows with the batch).
 */
export function CheckoutScanPanel({
  studentName,
  studentEmail,
  onStudentNameChange,
  onStudentEmailChange,
  code,
  onCodeChange,
  codeRef,
  suggestionsOpen,
  onSuggestionsOpenChange,
  suggestions,
  suggestionState,
  selectedItemName,
  listed,
  items,
  onAdd,
  onRemove,
  busy
}: {
  studentName: string;
  studentEmail: string;
  onStudentNameChange: (value: string) => void;
  onStudentEmailChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  codeRef: RefObject<HTMLInputElement | null>;
  suggestionsOpen: boolean;
  onSuggestionsOpenChange: (open: boolean) => void;
  suggestions: EquipmentItemSuggestion[];
  suggestionState: SuggestionState;
  selectedItemName: string | null;
  listed: string[];
  items: EquipmentItemSuggestion[];
  onAdd: () => void;
  onRemove: (code: string) => void;
  busy: boolean;
}) {
  return (
    <Panel id="checkout-student" title="Student and items" titleAs="h2">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="student-name">Student name</Label>
            <Input
              id="student-name"
              value={studentName}
              onChange={(event) => onStudentNameChange(event.target.value)}
              disabled={busy}
              placeholder="Full name"
              maxLength={200}
              autoComplete="off"
              required
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-email">Student email</Label>
            <Input
              id="student-email"
              type="email"
              value={studentEmail}
              onChange={(event) => onStudentEmailChange(event.target.value)}
              disabled={busy}
              placeholder="student@pausd.us"
              autoComplete="off"
              maxLength={254}
              required
              className={FIELD}
            />
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <Label htmlFor="item-code">Item code</Label>
          <div className="flex gap-2">
            <SuggestionCombobox
              id="item-code"
              inputRef={codeRef}
              value={code}
              onValueChange={onCodeChange}
              open={suggestionsOpen}
              onOpenChange={onSuggestionsOpenChange}
              options={suggestions}
              optionKey={(item) => item.id}
              renderOption={(item) => (
                <>
                  <span className="break-all font-mono text-[13px] tabular-nums text-foreground">{item.barcode}</span>
                  <span className="break-words text-xs text-muted-foreground">{item.name}</span>
                </>
              )}
              onPick={(item) => onCodeChange(item.barcode)}
              onEnter={onAdd}
              state={suggestionState}
              messages={{
                loading: "Loading item codes…",
                error: "Suggestions unavailable. You can still scan or enter an exact code.",
                empty: "No matching items. Check the code or item name; already-added items are hidden."
              }}
              listLabel="Matching item codes"
              placeholder="Scan code or search by code/name"
              disabled={busy}
              required={listed.length === 0}
              describedBy={selectedItemName ? "selected-item-name item-code-help" : "item-code-help"}
              className="flex-1"
              inputClassName={FIELD}
            />
            <Button type="button" variant="outline" className={FIELD} onClick={onAdd} disabled={busy || !code.trim()}>
              <Plus aria-hidden />
              Add
            </Button>
          </div>
          {selectedItemName ? (
            <p id="selected-item-name" className="text-[13px] text-muted-foreground">
              {selectedItemName}
            </p>
          ) : null}
          <p id="item-code-help" className="text-[13px] text-muted-foreground">
            Type a code or item name, select a match, then Add.
          </p>
        </div>

        {listed.length > 0 ? (
          <ul aria-label="Items to submit" className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {listed.map((entry) => (
              <li key={entry} className="flex min-h-12 items-center gap-3 py-1.5 pl-3 pr-1.5">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-[13px] tabular-nums text-foreground">{entry}</p>
                  <p className="break-words text-xs text-muted-foreground">{items.find((item) => item.barcode === entry)?.name}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 max-md:h-10 max-md:w-10"
                  aria-label={`Remove ${entry}`}
                  disabled={busy}
                  onClick={() => onRemove(entry)}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-border">
            <EmptyState size="inline" icon={ScanBarcode} title="Nothing listed yet." description="Scan or type a code to start." />
          </div>
        )}
      </div>
    </Panel>
  );
}
