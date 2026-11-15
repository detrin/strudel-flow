/** Search and tag filtering, shared by the Samples and Presets tabs. */

/** Every word of the query appears in the name or the tags. */
export function matches(query: string, name: string, tags: string[]) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${name} ${tags.join(' ')}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Has every selected tag. */
export const hasTags = (tags: string[], selected: string[]) =>
  selected.every((tag) => tags.includes(tag));

/** Tags with how many items have them, most used first. */
export function tagCounts(items: { tags: string[] }[]) {
  const counts = new Map<string, number>();
  for (const item of items)
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
}
