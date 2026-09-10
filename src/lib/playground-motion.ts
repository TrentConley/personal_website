export type Point = { x: number; y: number };
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
export function clampPosition(point: Point, bounds: Bounds): Point {
  return { x:Math.max(bounds.minX,Math.min(bounds.maxX,point.x)), y:Math.max(bounds.minY,Math.min(bounds.maxY,point.y)) };
}
export function throwPosition(point: Point, velocity: Point, bounds: Bounds, multiplier: number, maximum: number): Point {
  return clampPosition({ x:point.x + Math.max(-maximum,Math.min(maximum,velocity.x * multiplier)), y:point.y + Math.max(-maximum,Math.min(maximum,velocity.y * multiplier)) },bounds);
}
