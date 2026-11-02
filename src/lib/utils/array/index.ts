/**
 * Return a copy of a list with one item moved from one index to another. Items in between shift to fill the gap.
 *
 * Indexes are clamped to the list bounds.
 *
 * @example
 * moveItem(["a", "b", "c"], 0, 2); // ["b", "c", "a"]
 * moveItem(["a", "b", "c"], 2, 0); // ["c", "a", "b"]
 */
export const moveItem = <T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] => {
  const result = [...items];
  if (items.length === 0) return result;
  const last = items.length - 1;
  const fromIndex = Math.max(0, Math.min(from, last));
  const toIndex = Math.max(0, Math.min(to, last));
  const [item] = result.splice(fromIndex, 1) as [T];
  result.splice(toIndex, 0, item);
  return result;
};
