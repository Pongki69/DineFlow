export function walkInput(keys) {
  return {
    forward:
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown")),
    side:
      Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft")),
  };
}

// Labels float above tables: only physical meshes should block or receive interaction.
export function tableInSight(intersections) {
  const hit = intersections.find(
    ({ object, distance }) => object.isMesh && distance <= 3.5,
  );
  if (!hit) return null;
  for (let object = hit.object; object; object = object.parent) {
    if (object.userData?.tableId != null) return object.userData.tableId;
  }
  return null;
}

export class TableHold {
  start(id, now) {
    this.active = { id, since: now };
  }
  reset() {
    this.active = null;
  }
  update(id, available, now) {
    if (!this.active || this.active.id !== id || !available) {
      this.reset();
      return { progress: 0, completed: null };
    }
    const elapsed = now - this.active.since;
    const progress = Math.min(1, elapsed / 650);
    // Let the filled key remain visible briefly before opening the dialog.
    if (elapsed >= 750) {
      this.reset();
      return { progress: 1, completed: id };
    }
    return { progress, completed: null };
  }
}

export class PovJump {
  height = 0;
  velocity = 0;
  start() {
    if (this.height > 0 || this.velocity > 0) return;
    this.velocity = 5.5;
  }
  step(delta) {
    const dt = Math.min(delta, 0.05);
    this.height = Math.max(0, this.height + this.velocity * dt - 9 * dt * dt);
    this.velocity = this.height > 0 ? this.velocity - 18 * dt : 0;
    return this.height;
  }
}
