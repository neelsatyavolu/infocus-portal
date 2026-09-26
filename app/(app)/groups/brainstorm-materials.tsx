"use client";

import { ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  brainstormMaterialsReady,
  PROOF_OF_CONTACT_SLOTS,
  type BrainstormProofView
} from "@/src/lib/package-brainstorm";
import { cn } from "@/src/lib/utils";

type BrainstormMaterialsProps = {
  proofs?: BrainstormProofView[];
  docUrl?: string;
  approved: boolean;
  canEdit: boolean;
  compact?: boolean;
  onApprove: () => void;
};

export function BrainstormMaterials({
  proofs = [],
  docUrl = "",
  approved,
  canEdit,
  compact = false,
  onApprove
}: BrainstormMaterialsProps) {
  const ready = brainstormMaterialsReady(proofs.length, docUrl);
  const proofCount = proofs.length;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-2xl border border-border/60 bg-black/25 light:bg-muted",
        compact ? "p-2" : "p-4 sm:p-5"
      )}
    >
      <div className={cn("flex items-center justify-between gap-2", compact ? "mb-2" : "mb-3")}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
          Brainstorming
        </div>
        <span className="text-[10px] text-muted-foreground">
          {proofCount}/3 proofs{docUrl ? " · doc" : " · no doc"}
        </span>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1",
          compact ? "grid-cols-3 gap-1" : "grid-cols-1 gap-3 sm:grid-cols-3 sm:grid-rows-1 sm:gap-4"
        )}
      >
        {PROOF_OF_CONTACT_SLOTS.map((slot) => {
          const proof = proofs.find((item) => item.slot === slot);
          return proof ? (
            <a
              key={slot}
              href={proof.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="block h-full min-h-0 overflow-hidden rounded-xl border border-border"
              title={proof.fileName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proof.imageUrl}
                alt={`Proof ${slot}`}
                className={cn(
                  "h-full w-full object-cover",
                  compact ? "min-h-12" : "min-h-[14rem] sm:min-h-[18rem]"
                )}
              />
            </a>
          ) : (
            <div
              key={slot}
              className={cn(
                "grid h-full place-items-center rounded-xl border border-dashed border-border text-muted-foreground",
                compact ? "min-h-12 text-[10px]" : "min-h-[14rem] text-sm sm:min-h-[18rem]"
              )}
            >
              {slot}
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          compact ? "mt-2" : "mt-4 gap-3"
        )}
      >
        {docUrl ? (
          <a
            href={docUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: compact ? "sm" : "lg" }),
              compact ? "h-7 px-2 text-[11px]" : "h-11 px-5 text-sm"
            )}
          >
            <ExternalLink className={compact ? "h-3 w-3" : "h-4 w-4"} />
            Brainstorm doc
          </a>
        ) : (
          <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-sm")}>
            No Google Doc yet
          </span>
        )}
        {canEdit ? (
          <Button
            type="button"
            size={compact ? "sm" : "lg"}
            variant={approved ? "outline" : "default"}
            className={cn("ml-auto", compact ? "h-7 px-2 text-[11px]" : "h-11 px-6")}
            onClick={onApprove}
          >
            {approved ? "Unapprove" : ready ? "Approve" : "Approve anyway"}
          </Button>
        ) : approved ? (
          <span className={cn("ml-auto text-[var(--brand-green)]", compact ? "text-[11px]" : "text-sm")}>
            Approved
          </span>
        ) : null}
      </div>
    </div>
  );
}
