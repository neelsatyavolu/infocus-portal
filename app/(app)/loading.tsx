export default function AppLoading() {
  return (
    <div className="space-y-4">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-2xl border border-border bg-muted" />
        ))}
      </div>
    </div>
  );
}
