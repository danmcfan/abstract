// Where Tab should send focus to keep it inside a dialog, given its stops in
// order: round to the other end at either edge, back in if it has escaped,
// and null when the browser's own move stays inside.
export function wrapTab<T>(stops: readonly T[], active: T, back: boolean): T | null {
  const first = stops[0];
  const last = stops.at(-1);
  if (first === undefined || last === undefined) return null;
  if (!stops.includes(active)) return back ? last : first;
  if (back && active === first) return last;
  if (!back && active === last) return first;
  return null;
}

// The buttons a player can Tab to inside these roots, in order.
export function tabStops(roots: readonly (Element | null)[]): HTMLElement[] {
  return roots.flatMap((root) => (root ? Array.from(root.querySelectorAll<HTMLElement>("button:not(:disabled)")) : []));
}
