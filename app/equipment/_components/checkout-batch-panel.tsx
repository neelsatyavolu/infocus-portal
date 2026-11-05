import { Panel } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { FormStatus } from "@/components/equipment/equipment-api";
import { itemCountLabel } from "@/components/equipment/equipment-status";
import { StatusAlert } from "@/components/equipment/status-alert";

/** "Submit 3 items" / "Submitting…", shared by the rail and the phone action bar. */
export function submitLabel(busy: boolean, count: number) {
  return busy ? "Submitting…" : `Submit ${itemCountLabel(count)}`;
}

/**
 * The checkout rail: the batch count, the SD card declaration, the result message and Submit.
 * Sticky beside the scan panel on desktop; below it on phones, where Submit moves to the
 * StickyActionBar instead.
 */
export function CheckoutBatchPanel({
  listed,
  submitCount,
  tookSdCard,
  onTookSdCardChange,
  status,
  busy
}: {
  listed: number;
  submitCount: number;
  tookSdCard: boolean;
  onTookSdCardChange: (checked: boolean) => void;
  status: FormStatus;
  busy: boolean;
}) {
  return (
    <Panel id="checkout-batch" title="This batch" titleAs="h2" count={listed} description="Up to 50 items per submit.">
      <div className="space-y-4">
        <div>
          <Checkbox
            id="took-sd-card"
            checked={tookSdCard}
            onCheckedChange={onTookSdCardChange}
            disabled={busy}
            aria-describedby="sd-card-help"
          >
            I took an SD card
          </Checkbox>
          <p id="sd-card-help" className="pl-[1.625rem] text-[13px] leading-snug text-muted-foreground">
            Check only when taking an SD card with this batch. No item code needed for the card.
          </p>
        </div>
        <StatusAlert status={status} compact />
        <Button type="submit" className="hidden h-10 w-full lg:inline-flex" disabled={busy || submitCount === 0}>
          {submitLabel(busy, submitCount)}
        </Button>
      </div>
    </Panel>
  );
}
