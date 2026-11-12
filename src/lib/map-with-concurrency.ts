/**
 * Maps `items` through `task` with at most `limit` calls in flight, keeping input order.
 * Workers allow 6 outbound connections at once; keep fetch fan-out at 5 or fewer.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker);
  await Promise.all(workers);
  return results;
}
