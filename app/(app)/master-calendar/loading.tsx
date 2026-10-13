export default function MasterCalendarLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted" />
      <div className="overflow-x-auto rounded-2xl border border-border bg-card p-3 md:p-4">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border md:min-w-[780px] md:grid-cols-5">
          {Array.from({ length: 25 }).map((_, index) => (
            <div key={index} className="bg-card p-3 md:min-h-[16rem]">
              <div className="h-4 w-14 animate-pulse rounded-md bg-muted" />
              <div className="mt-4 h-24 animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
