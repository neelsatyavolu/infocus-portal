"use client";

import type { KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * A quiet inline nickname editor: reads as text until hover or focus (then the 3:1 control
 * border and a focus ring). "Save" appears inside the field once it changes, so the column never
 * shifts. Enter saves, Esc reverts, Tab moves on to the next person. Phones have no hover, so
 * there the field shows its "Add nickname" placeholder and a small pencil instead of a border,
 * and stays a 40px tap target.
 */
export function NicknameField({
  personName,
  value,
  dirty,
  saving,
  disabled,
  onChange,
  onSave,
  onRevert
}: {
  personName: string;
  value: string;
  dirty: boolean;
  saving: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onRevert: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && dirty) {
      event.preventDefault();
      onRevert();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      className="relative min-w-0"
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Add nickname"
        aria-label={`Nickname for ${personName}`}
        disabled={disabled}
        className={cn(
          "h-8 w-full min-w-0 rounded-md border bg-transparent px-2.5 text-base text-foreground transition-colors md:text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          // Quiet at rest: no border and no placeholder until the row is hovered or the field focused.
          "border-transparent placeholder:text-transparent hover:border-input focus:border-input focus:placeholder:text-muted-foreground group-hover/row:placeholder:text-muted-foreground",
          // Phones: no hover and no column header, so the placeholder and a pencil say it is editable.
          "max-sm:h-10 max-sm:pr-8 max-sm:placeholder:text-muted-foreground",
          dirty && "border-input pr-[4.25rem] max-sm:pr-[4.75rem]"
        )}
      />
      {dirty ? (
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={disabled}
          // Phones: the 32px button gets an invisible 4px hit margin, so the tap target is the field's 40px.
          className="absolute right-1 top-1/2 h-6 -translate-y-1/2 bg-card px-2 max-sm:h-8 max-sm:after:absolute max-sm:after:-inset-1 max-sm:after:content-['']"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      ) : (
        <Pencil
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:hidden"
        />
      )}
    </form>
  );
}
