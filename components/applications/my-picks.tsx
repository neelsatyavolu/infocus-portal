"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { Panel } from "@/components/kit/panel";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PickList } from "@/src/lib/applications/config";
import { ordinal, picksProblems, type Picks } from "@/src/lib/applications/desk";
import { cn } from "@/src/lib/utils";

type Applicant = { id: string; name: string; isMock: boolean; ai: { place: number; of: number } | null };

/** "Executive Producer" → "EP", for tight spots. */
export function shortLabel(label: string) {
  return label
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * The signed-in exec's picks: N people per list (2 for Executive Producer, 3 for Associate Producer
 * by default), one list per person, a reason each. Others' picks unlock once these are submitted.
 */
export function MyPicks({
  roundId,
  lists,
  applicants,
  initialPicks,
  initialReasons,
  submittedAt
}: {
  roundId: string;
  lists: PickList[];
  applicants: Applicant[];
  initialPicks: Picks;
  initialReasons: Record<string, string>;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<Picks>(() => Object.fromEntries(lists.map((list) => [list.key, initialPicks[list.key] ?? []])));
  const [reasons, setReasons] = useState(initialReasons);
  const [state, setState] = useState<SaveStateValue>(submittedAt ? "saved" : "idle");
  const listOf = (id: string) => lists.find((list) => picks[list.key]?.includes(id))?.key ?? "";
  const problems = picksProblems(picks, lists, applicants.length);

  function choose(id: string, key: string) {
    setPicks((current) => {
      const cleared = Object.fromEntries(Object.entries(current).map(([listKey, ids]) => [listKey, ids.filter((other) => other !== id)]));
      return key ? { ...cleared, [key]: [...(cleared[key] ?? []), id] } : cleared;
    });
    setState("dirty");
  }

  async function save(submit: boolean) {
    setState("saving");
    try {
      await send(`/api/applications/rounds/${roundId}/ranking`, "PUT", { picks, reasons, submit });
      setState("saved");
      if (submit) toast.success(submittedAt ? "Picks updated." : "Picks submitted. Everyone's picks are now visible to you.");
      router.refresh();
    } catch (error) {
      setState("error");
      toast.error(errorMessage(error));
    }
  }

  return (
    <Panel
      title="Your picks"
      status={
        <>
          {submittedAt ? <StatusTag tone="success">Submitted</StatusTag> : <StatusTag tone="warning">Not submitted</StatusTag>}
          <SaveState state={state} />
        </>
      }
      description={`Pick ${lists.map((list) => `${list.count} for ${list.label}`).join(" and ")}, with a reason for each. Others' picks stay hidden from you until you submit yours.`}
      footer={
        <>
          <span className="flex flex-wrap gap-3 font-mono tabular-nums">
            {lists.map((list) => (
              <span key={list.key} className={cn((picks[list.key]?.length ?? 0) >= list.count && "text-foreground")}>
                {list.label} {picks[list.key]?.length ?? 0}/{list.count}
              </span>
            ))}
          </span>
          <span className="flex gap-2">
            {!submittedAt ? (
              <Button size="sm" variant="outline" onClick={() => void save(false)} disabled={state === "saving"}>
                Save draft
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void save(true)} disabled={state === "saving" || problems.length > 0} title={problems[0]}>
              {submittedAt ? "Save changes" : "Submit picks"}
            </Button>
          </span>
        </>
      }
    >
      {applicants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submitted applications yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {applicants.map((applicant) => {
            const current = listOf(applicant.id);
            return (
              <li key={applicant.id} className="grid gap-2 px-3 py-2.5 lg:grid-cols-[minmax(10rem,14rem)_auto_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0">
                  <span className="flex items-center gap-2 truncate text-sm font-medium">
                    {applicant.name}
                    {applicant.isMock ? <StatusTag size="sm" tone="review">Mock</StatusTag> : null}
                  </span>
                  {applicant.ai ? <span className="font-mono text-[12px] text-muted-foreground">AI {ordinal(applicant.ai.place)} of {applicant.ai.of}</span> : null}
                </div>
                <SegmentedControl
                  size="sm"
                  ariaLabel={`Pick ${applicant.name} for`}
                  value={current}
                  onChange={(key) => choose(applicant.id, key)}
                  options={[
                    { value: "", label: "None" },
                    ...lists.map((list) => ({
                      value: list.key,
                      label: list.label,
                      disabled: current !== list.key && (picks[list.key]?.length ?? 0) >= list.count
                    }))
                  ]}
                  className="w-fit max-w-full"
                />
                {current ? (
                  <Input
                    aria-label={`Why ${applicant.name}`}
                    value={reasons[applicant.id] ?? ""}
                    maxLength={2000}
                    placeholder={`Why ${shortLabel(lists.find((list) => list.key === current)?.label ?? "")}?`}
                    onChange={(event) => {
                      setReasons((all) => ({ ...all, [applicant.id]: event.target.value }));
                      setState("dirty");
                    }}
                    className="h-8"
                  />
                ) : (
                  <span aria-hidden className="max-lg:hidden" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
