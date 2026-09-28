"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

/** Headline and anchor toss for a Final Cut, with an add/edit button for the toss. */
export function FinalCutShowCard({
  headline,
  toss,
  canEdit,
  onEdit,
  className
}: {
  headline: string | null;
  toss: string;
  canEdit: boolean;
  onEdit: () => void;
  className?: string;
}) {
  const missingToss = !toss.trim();
  if (!headline && missingToss && !canEdit) return null;

  return (
    <section className={cn("space-y-4 rounded-xl border border-border bg-card p-4", className)}>
      {headline ? (
        <div>
          <div className={LABEL}>Headline</div>
          <p className="mt-1 text-base font-medium text-foreground">{headline}</p>
        </div>
      ) : null}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className={LABEL}>Toss</div>
          {canEdit && !missingToss ? (
            <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          ) : null}
        </div>
        {missingToss ? (
          <div className="mt-1 space-y-2">
            <p className="text-sm text-muted-foreground">
              No toss yet. The anchors read it right before this package airs.
            </p>
            {canEdit ? (
              <Button type="button" size="sm" onClick={onEdit}>
                Add a toss
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">{toss}</p>
        )}
      </div>
    </section>
  );
}
