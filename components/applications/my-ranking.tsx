"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { Panel } from "@/components/kit/panel";
import { SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ordinal } from "@/src/lib/applications/desk";
import { cn } from "@/src/lib/utils";

type Applicant = { id: string; name: string; isMock: boolean; ai: { place: number; of: number } | null };

/**
 * The signed-in exec's own order of submitted applicants, best first, with a reason each. Others'
 * rankings unlock once this one is submitted; it stays editable after that.
 */
export function MyRanking({
  roundId,
  applicants,
  initialOrder,
  initialReasons,
  submittedAt
}: {
  roundId: string;
  applicants: Applicant[];
  initialOrder: string[];
  initialReasons: Record<string, string>;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const byId = new Map(applicants.map((applicant) => [applicant.id, applicant]));
  const [order, setOrder] = useState(initialOrder.filter((id) => byId.has(id)));
  const [reasons, setReasons] = useState(initialReasons);
  const [state, setState] = useState<SaveStateValue>(submittedAt ? "saved" : "idle");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setOrder((current) => arrayMove(current, current.indexOf(String(active.id)), current.indexOf(String(over.id))));
    setState("dirty");
  }

  async function save(submit: boolean) {
    setState("saving");
    try {
      await send(`/api/applications/rounds/${roundId}/ranking`, "PUT", { order, reasons, submit });
      setState("saved");
      if (submit) toast.success(submittedAt ? "Ranking updated." : "Ranking submitted. Everyone's rankings are now visible to you.");
      router.refresh();
    } catch (error) {
      setState("error");
      toast.error(errorMessage(error));
    }
  }

  return (
    <Panel
      title="Your ranking"
      status={
        <>
          {submittedAt ? <StatusTag tone="success">Submitted</StatusTag> : <StatusTag tone="warning">Not submitted</StatusTag>}
          <SaveState state={state} />
        </>
      }
      description="Drag applicants into your order, best first, and write why. Others' rankings stay hidden from you until you submit yours."
      footer={
        <>
          <span>{order.length} applicants</span>
          <span className="flex gap-2">
            {!submittedAt ? (
              <Button size="sm" variant="outline" onClick={() => void save(false)} disabled={state === "saving"}>
                Save draft
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void save(true)} disabled={state === "saving" || order.length === 0}>
              {submittedAt ? "Save changes" : "Submit ranking"}
            </Button>
          </span>
        </>
      }
    >
      {order.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submitted applications to rank yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2" aria-label="Your ranking">
              {order.map((id, index) => {
                const applicant = byId.get(id);
                if (!applicant) return null;
                return (
                  <SortableRow
                    key={id}
                    applicant={applicant}
                    place={index + 1}
                    reason={reasons[id] ?? ""}
                    onReason={(value) => {
                      setReasons((current) => ({ ...current, [id]: value }));
                      setState("dirty");
                    }}
                  />
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </Panel>
  );
}

function SortableRow({ applicant, place, reason, onReason }: { applicant: Applicant; place: number; reason: string; onReason: (value: string) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: applicant.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-md border border-border bg-card p-2.5 sm:grid-cols-[auto_14rem_1fr]", isDragging && "relative z-10 border-[var(--brand-green)]")}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Move ${applicant.name}, currently ${ordinal(place)}`}
        className="flex h-9 cursor-grab touch-none items-center gap-1.5 rounded-md px-1.5 text-muted-foreground hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
        <span className="w-6 text-left font-mono text-sm tabular-nums text-foreground">{place}</span>
      </button>
      <div className="flex min-w-0 flex-col justify-center">
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          {applicant.name}
          {applicant.isMock ? <StatusTag size="sm" tone="review">Mock</StatusTag> : null}
        </span>
        {applicant.ai ? <span className="font-mono text-[12px] text-muted-foreground">AI: {ordinal(applicant.ai.place)} of {applicant.ai.of}</span> : null}
      </div>
      <Textarea
        aria-label={`Why ${applicant.name} is ${ordinal(place)}`}
        rows={1}
        value={reason}
        maxLength={2000}
        placeholder="Why here?"
        onChange={(event) => onReason(event.target.value)}
        className="col-span-2 min-h-9 sm:col-span-1"
      />
    </li>
  );
}
