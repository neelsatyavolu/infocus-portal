import { useId } from "react";
import { Alert, InlineNote } from "@/components/kit/alert";
import { Field } from "@/components/kit/field";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { DaysField } from "./extension-days-input";

/**
 * A student (or a producer on a package group) asks for more time for the whole group. The draft
 * (cycle, days, reason) lives in the page, so closing the dialog keeps it.
 */
export function RequestExtensionDialog({
  open,
  onOpenChange,
  cycleNumber,
  cycleOptions,
  onCycleChange,
  days,
  onDaysChange,
  reason,
  onReasonChange,
  submitting,
  pendingWarning,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleNumber: number | null;
  cycleOptions: number[];
  onCycleChange: (cycleNumber: number) => void;
  days: number;
  onDaysChange: (days: number) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  submitting: boolean;
  /** The chosen cycle already has a pending request for the viewer's group (the server decides). */
  pendingWarning: string | null;
  onSubmit: () => void;
}) {
  const ids = useId();

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request an extension</DialogTitle>
          <DialogDescription>
            Covers your whole package group. Teammates agree first, then two producers review it.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cycle" htmlFor={`${ids}-cycle`}>
              <NativeSelect
                id={`${ids}-cycle`}
                value={cycleNumber ?? ""}
                onChange={(event) => onCycleChange(Number(event.target.value))}
                disabled={cycleNumber === null}
              >
                {cycleNumber === null ? <option value="">…</option> : null}
                {cycleOptions.map((value) => (
                  <option key={value} value={value}>
                    Cycle {value}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <DaysField id={`${ids}-days`} value={days} onChange={onDaysChange} />
          </div>

          <Field label="Reason (optional)" htmlFor={`${ids}-reason`}>
            <Input
              id={`${ids}-reason`}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Family emergency, unresolvable technical issue, …"
            />
          </Field>

          <InlineNote>You must be on a package group for the selected cycle.</InlineNote>
          {pendingWarning ? (
            <Alert tone="warning" compact>
              {pendingWarning}
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || cycleNumber === null}>
              {submitting ? <Spinner /> : null}
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
