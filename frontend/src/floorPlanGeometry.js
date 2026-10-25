export function chairPositions(shape, capacity, layout, dimensions = {}) {
  const seats = [];
  const width = Number(dimensions.width) || (shape === "long" ? 2.4 : 1.45);
  const depth = Number(dimensions.depth) || (shape === "long" ? 1.15 : 1.45);
  const count = Math.max(1, Math.min(12, Number(capacity) || 2));
  const addSide = (side, amount) => {
    const total = Math.max(0, Math.min(12, Number(amount) || 0));
    for (let i = 0; i < total; i += 1) {
      const t = (i + 1) / (total + 1);
      if (side === "top")
        seats.push({
          x: (t - 0.5) * width * 0.76,
          z: -(depth / 2 + 0.3),
          rotation: 0,
        });
      if (side === "bottom")
        seats.push({
          x: (t - 0.5) * width * 0.76,
          z: depth / 2 + 0.3,
          rotation: Math.PI,
        });
      if (side === "left")
        seats.push({
          x: -(width / 2 + 0.3),
          z: (t - 0.5) * depth * 0.72,
          rotation: Math.PI / 2,
        });
      if (side === "right")
        seats.push({
          x: width / 2 + 0.3,
          z: (t - 0.5) * depth * 0.72,
          rotation: -Math.PI / 2,
        });
    }
  };

  if (shape === "long") {
    if (
      layout &&
      ["top", "bottom", "left", "right"].some(
        (side) => layout[side] !== undefined,
      )
    ) {
      ["top", "bottom", "left", "right"].forEach((side) =>
        addSide(side, layout[side] || 0),
      );
    } else {
      addSide("top", Math.ceil(count / 2));
      addSide("bottom", Math.floor(count / 2));
    }
  } else {
    const around = Math.max(1, Math.min(12, Number(layout?.around) || count));
    for (let i = 0; i < around; i += 1) {
      const angle = (2 * Math.PI * i) / around - Math.PI / 2;
      seats.push({
        x: Math.cos(angle) * (width / 2 + 0.3),
        z: Math.sin(angle) * (depth / 2 + 0.3),
        rotation: -angle - Math.PI / 2,
      });
    }
  }
  return seats;
}

export function defaultChairLayout(shape, capacity) {
  const count = Math.max(1, Math.min(12, Number(capacity) || 2));
  if (shape === "long")
    return {
      top: Math.ceil(count / 2),
      bottom: Math.floor(count / 2),
      left: 0,
      right: 0,
    };
  return { around: count };
}
