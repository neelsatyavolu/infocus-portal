function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Names containing every word of the query, ignoring case and accents. Keeps the original order. */
export function filterNames(names: string[], query: string): string[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return names;
  return names.filter((name) => {
    const haystack = normalize(name);
    return terms.every((term) => haystack.includes(term));
  });
}
