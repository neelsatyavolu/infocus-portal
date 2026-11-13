import { StatusTag } from "@/components/kit/status-tag";
import { Panel } from "@/components/kit/panel";

export type ReleasedDecision = { label: string; message: string; tone: "success" | "info" | "neutral" | "danger" };

/** An applicant's own released decision. Only ever rendered for the applicant it belongs to. */
export function DecisionCard({ title, decision }: { title: string; decision: ReleasedDecision }) {
  return (
    <Panel
      tone={decision.tone === "success" ? "brand" : "default"}
      eyebrow={`${title} · Decision`}
      title={decision.label}
      status={<StatusTag tone={decision.tone}>Released</StatusTag>}
    >
      <p className="max-w-[65ch] whitespace-pre-line text-sm leading-relaxed text-foreground">{decision.message}</p>
    </Panel>
  );
}
