"use client";

import { Pencil } from "lucide-react";
import { KeyValueList } from "@/components/kit/key-value";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";

/**
 * "What airs": the Final Cut's headline and the anchors' toss, with one Edit toss / Add a toss
 * action. A missing toss is a NO TOSS tag beside the title plus one line saying why it matters.
 * Hidden when there is nothing to show and the viewer can't add a toss.
 */
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
    <Panel
      title="What airs"
      titleAs="h2"
      status={missingToss ? <StatusTag tone="warning">No toss</StatusTag> : null}
      padding="md"
      className={className}
      actions={
        canEdit ? (
          <Button type="button" size="sm" variant="outline" className="max-sm:h-10" onClick={onEdit}>
            <Pencil aria-hidden />
            {missingToss ? "Add a toss" : "Edit toss"}
          </Button>
        ) : null
      }
    >
      <KeyValueList
        layout="stacked"
        items={[
          {
            key: "headline",
            label: "Headline",
            value: <span className="text-base font-medium text-foreground">{headline}</span>,
            hidden: !headline
          },
          {
            key: "toss",
            label: "Toss",
            value: missingToss ? (
              <span className="text-muted-foreground">
                No toss yet. The anchors read it right before this package airs.
              </span>
            ) : (
              <span className="whitespace-pre-line leading-relaxed">{toss}</span>
            )
          }
        ]}
      />
    </Panel>
  );
}
