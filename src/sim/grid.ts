// The board is measured in grid cells. Node positions are the cell of their
// top-left corner; rendering maps cells to world units.

export interface Size {
  width: number;
  height: number;
}

// Most levels fit on this board; a level with wide parts can ask for more.
export const DEFAULT_GRID: Size = { width: 45, height: 45 };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function snap(rect: Rect, grid: Size): Rect {
  return {
    ...rect,
    x: clamp(Math.round(rect.x), 0, grid.width - rect.width),
    y: clamp(Math.round(rect.y), 0, grid.height - rect.height),
  };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
