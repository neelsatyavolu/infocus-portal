export default function MasterCalendarLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted" />
      <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
        <div className="grid grid-cols-5 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {Array.from({ length: 25 }).map((_, index) => (
            <div key={index} className="min-h-[16rem] bg-card p-3">
              <div className="h-4 w-14 animate-pulse rounded-full bg-muted" />
              <div className="mt-4 h-24 animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
