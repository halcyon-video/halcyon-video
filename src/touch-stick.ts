/** Radial dead zone and bounded analog travel, in CSS pixels. */
export function touchStickVector(dx: number, dy: number, radius = 42): { x: number; y: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) return { x: 0, y: 0 };
  const distance = Math.hypot(dx, dy), dead = radius * 0.15;
  if (distance <= dead) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (distance - dead) / (radius - dead));
  return { x: dx / distance * magnitude, y: dy / distance * magnitude };
}
