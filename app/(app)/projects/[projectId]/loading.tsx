export default function ProjectLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="h-10 w-10 rounded-xl bg-muted" />
            <div className="h-8 w-56 rounded-lg bg-muted" />
            <div className="h-4 w-80 max-w-full rounded-lg bg-muted" />
          </div>
          <div className="h-7 w-32 rounded-full bg-muted" />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-10 w-32 rounded-xl bg-muted" />
            <div className="h-10 w-24 rounded-xl bg-muted" />
            <div className="h-10 w-40 rounded-xl bg-muted" />
            <div className="h-10 w-40 rounded-xl bg-muted" />
          </div>
          <div className="h-10 w-28 rounded-xl bg-secondary" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="h-6 w-32 rounded-lg bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="aspect-video bg-muted" />
              <div className="space-y-3 p-3">
                <div className="h-5 w-3/4 rounded-lg bg-muted" />
                <div className="h-4 w-1/2 rounded-lg bg-muted" />
                <div className="h-8 w-24 rounded-lg bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
