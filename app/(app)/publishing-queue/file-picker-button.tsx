"use client";

import type { RefObject } from "react";
import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "./queue-view-model";

/**
 * An outline h-9 "Choose video" button (same height as the Title input) that opens a hidden
 * file input, with the chosen file's name and size beside it. With an `id`, the button's name is
 * its own words ("Choose video" / "Change video", even under a Field label) and the file name and
 * size are its description.
 */
export function FilePickerButton({
  id,
  accept,
  disabled = false,
  file,
  inputRef,
  onChange
}: {
  id?: string;
  accept?: string;
  disabled?: boolean;
  file: File | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (file: File | null) => void;
}) {
  const actionId = id ? `${id}-action` : undefined;
  const fileId = id ? `${id}-file` : undefined;
  const sizeId = id ? `${id}-size` : undefined;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-labelledby={actionId}
        aria-describedby={file ? `${fileId} ${sizeId}` : fileId}
        onClick={() => inputRef.current?.click()}
      >
        <Film aria-hidden />
        <span id={actionId}>{file ? "Change video" : "Choose video"}</span>
      </Button>
      <span id={fileId} className="min-w-0 flex-1 truncate text-sm" title={file?.name}>
        {file ? file.name : <span className="text-muted-foreground">No video chosen</span>}
      </span>
      {file ? (
        <span id={sizeId} className="shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground">
          {formatFileSize(file.size)}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        hidden
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
