"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Download, GitMerge, MoreHorizontal, Pencil, RefreshCw, Trash2, UploadCloud } from "lucide-react";
export type DropdownOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  hint?: string;
};

type VideoCardMenuProps = {
  reviewHref: string;
  versionValue?: string;
  versionOptions?: DropdownOption<string>[];
  onVersionChange?: (versionId: string) => void;
  statusValue?: string;
  statusOptions?: DropdownOption<string>[];
  onStatusChange?: (status: string) => void;
  statusDisabled?: boolean;
  onUploadNewVersion?: () => void;
  onMoveIntoVersion?: () => void;
  onDownloadOriginal?: () => void;
  onRename?: () => void;
  onSyncTurnedInDate?: () => void;
  syncTurnedInDisabled?: boolean;
  onDelete?: () => void;
};

type SubmenuKey = "version" | "status" | null;

function FlyoutMenuRow({
  label,
  open,
  disabled,
  onOpenChange,
  children
}: {
  label: string;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      onOpenChange(false);
      closeTimerRef.current = null;
    }, 140);
  }, [clearCloseTimer, onOpenChange]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (!disabled) {
          clearCloseTimer();
          onOpenChange(true);
        }
      }}
      onMouseLeave={() => {
        if (!disabled) {
          scheduleClose();
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) {
            return;
          }
          onOpenChange(!open);
        }}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{label}</span>
        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition ${open ? "translate-x-0.5" : ""}`} />
      </button>

      {open ? (
        <div
          className="absolute left-[calc(100%+6px)] top-0 z-40 min-w-48 rounded-lg border border-border bg-popover p-1.5 shadow-xl"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function FlyoutMenuOptions({
  value,
  options,
  onSelect
}: {
  value: string;
  options: DropdownOption<string>[];
  onSelect: (value: string) => void;
}) {
  return (
    <>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(option.value);
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left ${
              active ? "bg-secondary text-foreground" : "text-foreground hover:bg-accent"
            }`}
          >
            <span className="truncate text-sm">
              {option.label}
              {option.hint ? <span className="ml-2 text-xs text-muted-foreground">{option.hint}</span> : null}
            </span>
            {active ? <Check className="h-3.5 w-3.5 shrink-0 text-foreground" /> : null}
          </button>
        );
      })}
    </>
  );
}

export function VideoCardMenu({
  reviewHref,
  versionValue,
  versionOptions,
  onVersionChange,
  statusValue,
  statusOptions,
  onStatusChange,
  statusDisabled = false,
  onUploadNewVersion,
  onMoveIntoVersion,
  onDownloadOriginal,
  onRename,
  onSyncTurnedInDate,
  syncTurnedInDisabled = false,
  onDelete
}: VideoCardMenuProps) {
  const [open, setOpen] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState<SubmenuKey>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
        setSubmenuOpen(null);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const hasVersionFlyout = Boolean(versionValue && versionOptions?.length && onVersionChange);
  const hasStatusFlyout = Boolean(statusValue && statusOptions?.length && onStatusChange);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => {
            const next = !current;
            if (!next) {
              setSubmenuOpen(null);
            }
            return next;
          });
        }}
        className="rounded-md border border-border bg-muted p-1 text-foreground hover:bg-accent"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-8 z-30 w-52 rounded-lg border border-border bg-popover p-1.5 text-sm shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          {hasVersionFlyout ? (
            <FlyoutMenuRow
              label="Version"
              open={submenuOpen === "version"}
              onOpenChange={(isOpen) =>
                setSubmenuOpen((current) => (isOpen ? "version" : current === "version" ? null : current))
              }
            >
              <FlyoutMenuOptions
                value={versionValue!}
                options={versionOptions!}
                onSelect={(value) => {
                  onVersionChange?.(value);
                  setSubmenuOpen(null);
                  setOpen(false);
                }}
              />
            </FlyoutMenuRow>
          ) : null}

          {hasStatusFlyout ? (
            <FlyoutMenuRow
              label="Status"
              open={submenuOpen === "status"}
              disabled={statusDisabled}
              onOpenChange={(isOpen) =>
                setSubmenuOpen((current) => (isOpen ? "status" : current === "status" ? null : current))
              }
            >
              <FlyoutMenuOptions
                value={statusValue!}
                options={statusOptions!}
                onSelect={(value) => {
                  onStatusChange?.(value);
                  setSubmenuOpen(null);
                  setOpen(false);
                }}
              />
            </FlyoutMenuRow>
          ) : null}

          {(hasVersionFlyout || hasStatusFlyout) ? <div className="my-1 border-t border-border" /> : null}

          {onUploadNewVersion ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSubmenuOpen(null);
                setOpen(false);
                onUploadNewVersion();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent"
            >
              <UploadCloud className="h-3.5 w-3.5 text-muted-foreground" />
              Upload new version
            </button>
          ) : null}

          {onMoveIntoVersion ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSubmenuOpen(null);
                setOpen(false);
                onMoveIntoVersion();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent"
            >
              <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
              Move into version
            </button>
          ) : null}

          {onSyncTurnedInDate ? (
            <button
              type="button"
              disabled={syncTurnedInDisabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (syncTurnedInDisabled) {
                  return;
                }
                setSubmenuOpen(null);
                setOpen(false);
                onSyncTurnedInDate();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${syncTurnedInDisabled ? "animate-spin" : ""}`} />
              Sync turn-in date
            </button>
          ) : null}

          {onDownloadOriginal ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSubmenuOpen(null);
                setOpen(false);
                onDownloadOriginal();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              Download original
            </button>
          ) : null}

          {onRename ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSubmenuOpen(null);
                setOpen(false);
                onRename();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Rename video
            </button>
          ) : null}

          <a
            href={reviewHref}
            className={`block rounded-md px-2 py-1.5 text-foreground hover:bg-accent ${
              onUploadNewVersion || onMoveIntoVersion || onSyncTurnedInDate || onDownloadOriginal || onRename ? "mt-1" : ""
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            Open review
          </a>

          {onDelete ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSubmenuOpen(null);
                setOpen(false);
                onDelete();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-danger hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete video
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
