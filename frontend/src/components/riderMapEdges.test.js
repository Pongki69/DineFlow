import { expect, it } from "vitest";
import { riderEdgePoint } from "./riderMapEdges";

it("keeps visible riders on the map and projects outside riders onto safe edges", () => {
  const size = { x: 800, y: 520 };
  expect(riderEdgePoint({ x: 400, y: 250 }, size)).toBeNull();
  for (const point of [
    { x: -900, y: 250 },
    { x: 400, y: -900 },
    { x: 2000, y: 2000 },
    { x: 900, y: 260 },
  ]) {
    const edge = riderEdgePoint(point, size);
    expect(edge.x).toBeGreaterThanOrEqual(28);
    expect(edge.x).toBeLessThanOrEqual(772);
    expect(edge.y).toBeGreaterThanOrEqual(120);
    expect(edge.y).toBeLessThanOrEqual(492);
    expect(Number.isFinite(edge.angle)).toBe(true);
  }
});
it("does not produce broken positions for unavailable or tiny viewports", () => {
  expect(riderEdgePoint({ x: NaN, y: 20 }, { x: 800, y: 520 })).toBeNull();
  expect(riderEdgePoint({ x: -200, y: 50 }, { x: 80, y: 80 })).toBeNull();
});
