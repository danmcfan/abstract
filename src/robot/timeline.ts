// Easing for animation over time. Pure numbers, so the timing of a clip can
// be tested without a renderer.

// 0 before start, 1 after end, linear in between.
export function progress(t: number, start: number, end: number): number {
  if (end <= start) return t < start ? 0 : 1;
  return Math.min(Math.max((t - start) / (end - start), 0), 1);
}

export function smoothstep(x: number): number {
  return x * x * (3 - 2 * x);
}

export function mix(a: number, b: number, x: number): number {
  return a + (b - a) * x;
}
