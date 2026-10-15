/**
 * Column classes for the List view, shared by the header, asset rows and folder rows so every
 * column lines up. The list is an @container: columns drop out as its own width shrinks (not the
 * viewport's), so it fits beside the shell's rail and Assets sidebar.
 *   < 36rem  phone row: thumbnail (with its checkbox) · title + compact meta · actions
 *   ≥ 36rem  checkbox · thumbnail · name · status · comments · actions
 *   people (Final Cut folder only) is an icon button until 44rem, then avatars + "Edit"
 *   ≥ 52rem  + version (folded into the name's meta line below that)
 *   ≥ 60rem  + uploaded date
 */
export const LIST_COLUMNS = {
  check: "hidden w-10 shrink-0 items-center justify-center @min-[36rem]:flex",
  thumb: "flex w-24 shrink-0 @min-[36rem]:w-20",
  name: "min-w-0 flex-1",
  version: "hidden w-12 shrink-0 font-mono-broadcast text-[13px] tabular-nums @min-[52rem]:block",
  status: "hidden w-40 shrink-0 flex-wrap items-center gap-1 @min-[36rem]:flex",
  people: "flex w-10 shrink-0 items-center @min-[44rem]:w-32",
  comments: "hidden w-12 shrink-0 text-right font-mono-broadcast text-[13px] tabular-nums @min-[36rem]:block",
  uploaded: "hidden w-28 shrink-0 font-mono-broadcast text-[13px] tabular-nums @min-[60rem]:block",
  actions: "flex shrink-0 items-center justify-end gap-2"
} as const;

/** Shown only while the version column is hidden (it moves into the name's meta line). */
export const VERSION_IN_META = "@min-[52rem]:hidden";

/** Shown only in the phone row layout. */
export const PHONE_ONLY = "@min-[36rem]:hidden";

export const LIST_ROW = "flex min-h-14 items-center gap-3 px-3 py-2 @max-[36rem]:min-h-[4.5rem]";

export const LIST_SHELL = "@container min-w-0 overflow-hidden rounded-md border border-border bg-card";

/**
 * In List view the toolbar's and selection bar's select-all box (the same 40px box as the rows')
 * moves in by LIST_SHELL's 1px border plus LIST_ROW's 12px padding, so it sits right above the
 * checkbox column it controls.
 */
export const LIST_CHECK_INSET = {
  /** The toolbar is a @container like the list: from 36rem, where rows show the column. */
  toolbar: "@min-[36rem]:ml-[13px]",
  /** The selection bar's select-all box only shows from lg. */
  selectionBar: "lg:ml-[13px]"
} as const;
