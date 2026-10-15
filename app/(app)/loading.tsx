/** Shaped like a redesigned page: the header plate, then a row of cards. */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <div className="brand-hero-panel space-y-3 px-5 py-5 md:px-6">
        <div className="h-3 w-28 animate-pulse rounded-sm bg-muted" />
        <div className="h-7 w-64 max-w-full animate-pulse rounded-sm bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-sm bg-muted" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-56 animate-pulse rounded-md border border-border bg-card lg:col-span-2" />
        <div className="h-56 animate-pulse rounded-md border border-border bg-card" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-md border border-border bg-card" />
        <div className="h-40 animate-pulse rounded-md border border-border bg-card" />
      </div>
    </div>
  );
}
