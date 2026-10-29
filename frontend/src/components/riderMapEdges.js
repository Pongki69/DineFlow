// Project an off-screen location onto the map's safe inner edge.
export function riderEdgePoint(point, size) {
  const { x, y } = point,
    { x: width, y: height } = size;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width < 100 ||
    height < 160 ||
    (x >= 0 && x <= width && y >= 0 && y <= height)
  )
    return null;
  const center = { x: width / 2, y: height / 2 };
  const dx = x - center.x,
    dy = y - center.y;
  const left = 28,
    right = width - 28,
    top = 120,
    bottom = height - 28;
  const horizontal =
    dx > 0
      ? (right - center.x) / dx
      : dx < 0
        ? (left - center.x) / dx
        : Infinity;
  const vertical =
    dy > 0
      ? (bottom - center.y) / dy
      : dy < 0
        ? (top - center.y) / dy
        : Infinity;
  const scale = Math.max(0, Math.min(horizontal, vertical));
  return {
    x: Math.max(left, Math.min(right, center.x + dx * scale)),
    y: Math.max(top, Math.min(bottom, center.y + dy * scale)),
    angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
  };
}
