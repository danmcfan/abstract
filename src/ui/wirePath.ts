import type { Route } from "../sim/route";

const CORNER_RADIUS = 0.5;
const HOP_RADIUS = 0.4;

// SVG path data for a route, with rounded corners and a hop over each
// crossing wire.
export function wirePath(route: Route): string {
  const points = route.points;
  const [start] = points;
  if (start === undefined) throw new Error("A route needs at least one point");
  const parts = [`M ${start.x} ${start.y}`];
  let previous = start;
  for (const [i, corner] of points.entries()) {
    if (i === 0) continue;
    const from = previous;
    const next = points[i + 1];
    const inLength = Math.hypot(corner.x - from.x, corner.y - from.y);
    const outLength = next ? Math.hypot(next.x - corner.x, next.y - corner.y) : 0;
    const r = next ? Math.min(CORNER_RADIUS, inLength / 2, outLength / 2) : 0;
    const ux = Math.sign(corner.x - from.x);
    const uy = Math.sign(corner.y - from.y);

    // Hops along this segment, in travel order.
    if (uy === 0) {
      const hops = route.hops.filter((h) => h.y === corner.y && (h.x - from.x) * ux > 0 && (corner.x - h.x) * ux > 0);
      hops.sort((a, b) => (a.x - b.x) * ux);
      for (const h of hops) {
        parts.push(
          `L ${h.x - HOP_RADIUS * ux} ${h.y}`,
          `A ${HOP_RADIUS} ${HOP_RADIUS} 0 0 ${ux > 0 ? 1 : 0} ${h.x + HOP_RADIUS * ux} ${h.y}`,
        );
      }
    }

    if (!next || r === 0) {
      parts.push(`L ${corner.x} ${corner.y}`);
    } else {
      const vx = Math.sign(next.x - corner.x);
      const vy = Math.sign(next.y - corner.y);
      parts.push(
        `L ${corner.x - ux * r} ${corner.y - uy * r}`,
        `Q ${corner.x} ${corner.y} ${corner.x + vx * r} ${corner.y + vy * r}`,
      );
    }
    previous = corner;
  }
  return parts.join(" ");
}
