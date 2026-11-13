import type { ReactNode } from "react";

/**
 * One round as a compact card row: position caps label, title with status tags, one muted line,
 * and the action vertically centred on the right. Sized to its content (no empty card body).
 */
export function RoundRow({
  eyebrow,
  title,
  status,
  meta,
  action
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md border border-border bg-card px-4 py-3.5 md:px-5">
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">{eyebrow}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="min-w-0 text-base font-semibold leading-snug">{title}</h2>
          {status}
        </div>
        {meta ? <p className="text-[13px] text-muted-foreground">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}
