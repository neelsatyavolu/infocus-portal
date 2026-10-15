"use client";

import { Check, PackageOpen, Plus, SearchX } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { SearchField } from "@/components/kit/search-field";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

export type PublicItem = { id: string; name: string; barcode: string };

/** ITEM | CODE | toggle from sm; name over code with the toggle on the right on phones. */
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_minmax(6rem,12rem)_7rem]";

/**
 * The gear people pick from. It flows with the page (no inner scrollbar); the column header sticks
 * under the top bar while the list scrolls past.
 */
export function RequestCatalog({
  items,
  filteredItems,
  loaded,
  loadError,
  onRetry,
  search,
  onSearchChange,
  selected,
  onToggle
}: {
  items: PublicItem[];
  filteredItems: PublicItem[];
  loaded: boolean;
  loadError: string | null;
  onRetry: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  selected: string[];
  onToggle: (barcode: string) => void;
}) {
  let body;
  if (loadError) {
    body = (
      <div className="p-4 md:p-5">
        <Alert
          tone="danger"
          action={
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      </div>
    );
  } else if (!loaded) {
    body = (
      <LoadingRegion label="Loading equipment" className="divide-y divide-border">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={cn(ROW_GRID, "min-h-12 px-4 py-2 md:px-5")}>
            <Skeleton className={cn("h-3.5", index % 2 ? "w-1/2" : "w-2/3")} />
            <Skeleton className="hidden h-3 w-20 sm:block" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        ))}
      </LoadingRegion>
    );
  } else if (items.length === 0) {
    body = <EmptyState icon={PackageOpen} title="No equipment is available right now." description="Check back later, or ask a manager." />;
  } else if (filteredItems.length === 0) {
    body = (
      <EmptyState
        size="inline"
        icon={SearchX}
        title={`No items match “${search.trim()}”.`}
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => onSearchChange("")}>
            Clear search
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <div
          aria-hidden
          className={cn(
            ROW_GRID,
            "sticky top-[var(--app-header-h,0px)] z-10 hidden h-10 border-b border-border bg-card px-4 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground sm:grid md:px-5"
          )}
        >
          <span>Item</span>
          <span>Code</span>
          <span />
        </div>
        <ul aria-label="Available equipment" className="divide-y divide-border">
          {filteredItems.map((item) => {
            const isSelected = selected.includes(item.barcode);
            return (
              <li
                key={item.id}
                className={cn(
                  ROW_GRID,
                  "min-h-12 px-4 py-2 transition-colors last:rounded-b-md md:px-5",
                  isSelected && "bg-[var(--brand-green)]/10"
                )}
              >
                <div className="min-w-0">
                  <p className="break-words text-sm text-foreground">{item.name}</p>
                  <p className="break-all font-mono text-xs tabular-nums text-muted-foreground sm:hidden">{item.barcode}</p>
                </div>
                <p className="hidden break-all font-mono text-xs tabular-nums text-muted-foreground sm:block">{item.barcode}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-pressed={isSelected}
                  onClick={() => onToggle(item.barcode)}
                  className={cn(
                    "w-28 justify-self-end max-lg:h-10",
                    isSelected && "border-[var(--brand-green)] text-[var(--brand-green)] hover:text-[var(--brand-green)]"
                  )}
                >
                  {isSelected ? <Check aria-hidden /> : <Plus aria-hidden />}
                  {isSelected ? "Selected" : "Add"}
                  <span className="sr-only"> {item.name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <Panel
      id="available-equipment"
      title="Available equipment"
      titleAs="h2"
      count={loaded && !loadError ? items.length : null}
      padding="none"
    >
      <div className="border-b border-border px-4 py-3 md:px-5">
        <SearchField
          id="request-search"
          value={search}
          onChange={onSearchChange}
          placeholder="Search by name or code"
          ariaLabel="Find equipment"
          size="touch"
        />
      </div>
      {body}
    </Panel>
  );
}
