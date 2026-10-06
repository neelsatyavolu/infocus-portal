export default function ReviewLoading() {
  return (
    <div className="grid animate-pulse gap-3 xl:grid-cols-[minmax(0,1fr)_420px]" aria-busy="true" aria-label="Loading review">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-6 w-56 max-w-full rounded-lg bg-muted" />
            <div className="h-4 w-32 rounded-lg bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded-lg bg-muted" />
            <div className="h-9 w-24 rounded-lg bg-muted" />
          </div>
        </div>
        <div className="aspect-video w-full rounded-2xl border border-border bg-muted" />
        <div className="space-y-2 px-1">
          <div className="h-1.5 w-full rounded-full bg-muted" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-muted" />
            <div className="h-4 w-28 rounded-lg bg-muted" />
            <div className="ml-auto h-8 w-14 rounded-md bg-muted" />
          </div>
        </div>
      </section>

      <aside className="flex min-h-[620px] flex-col rounded-2xl border border-border bg-card">
        <div className="grid h-11 grid-cols-2 border-b border-border">
          <div className="m-3 h-4 w-24 justify-self-center rounded-lg bg-muted" />
          <div className="m-3 h-4 w-20 justify-self-center rounded-lg bg-muted" />
        </div>
        <div className="flex-1 space-y-3 p-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-border bg-muted/60 p-2.5">
              <div className="flex items-start gap-2">
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-muted" />
                  <div className="h-4 w-full rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3">
          <div className="h-[60px] w-full rounded-md bg-muted" />
        </div>
      </aside>
    </div>
  );
}
