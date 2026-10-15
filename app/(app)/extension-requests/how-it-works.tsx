import { StatusDot } from "@/components/kit/status-tag";

const STEPS = [
  {
    label: "Ask",
    body: "Covers your whole package group. You must be on a group for that cycle; one pending request per group."
  },
  { label: "Every member agrees", body: "Teammates tap I agree. One decline denies it." },
  {
    label: "Two producer approvals",
    body: "The first sets the days (0.1–30, decimals OK) and who gets them; the second approves those terms."
  },
  { label: "Decision email", body: "Each covered student gets one email." }
] as const;

/**
 * The rules: four steps with the same square number markers as the Sign-off steps, then the
 * exec-grant note and what the green dot on a request means. Folds away under the toolbar's How
 * it works toggle, and stays open while there are no requests.
 */
export function HowItWorks({ id }: { id: string }) {
  return (
    <section id={id} aria-label="How extension requests work" className="rounded-md border border-border bg-card p-4 md:p-5">
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.label} className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-sm border border-[var(--ink-4)] font-mono-broadcast text-[11px] font-medium tabular-nums text-muted-foreground"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="flex min-h-6 items-center text-sm font-semibold text-foreground">{step.label}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-[var(--ink-text)]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-[13px] leading-snug text-muted-foreground">
        <p className="max-w-prose">
          Executive producers can grant directly or grant a pending request early; one more exec approves. A
          grant for some members stays private to them.
        </p>
        <p className="flex max-w-prose items-center gap-2">
          <StatusDot tone="new" size={6} />
          A green dot on a request means someone changed it since your last visit.
        </p>
      </div>
    </section>
  );
}
