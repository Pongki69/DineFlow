import { describe, expect, it } from "vitest";
import { PovJump, TableHold, tableInSight, walkInput } from "./walkNavigation";

describe("POV movement", () => {
  it("walks backward with S or the down arrow and cancels opposing keys", () => {
    expect(walkInput(new Set(["KeyS"])).forward).toBe(-1);
    expect(walkInput(new Set(["ArrowDown"])).forward).toBe(-1);
    expect(walkInput(new Set(["KeyW", "KeyS"])).forward).toBe(0);
    expect(walkInput(new Set(["KeyW", "KeyD"]))).toEqual({
      forward: 1,
      side: 1,
    });
  });
});

describe("POV jumping", () => {
  it("rises, falls, and lands without sinking below eye level", () => {
    const jump = new PovJump();
    jump.start();
    const heights = Array.from({ length: 90 }, () => jump.step(1 / 60));
    expect(Math.max(...heights)).toBeGreaterThan(0.7);
    expect(Math.max(...heights)).toBeLessThan(1);
    expect(heights.every((height) => height >= 0)).toBe(true);
    expect(jump.height).toBe(0);
    expect(jump.velocity).toBe(0);
    jump.start();
    expect(jump.step(1 / 60)).toBeGreaterThan(0);
  });
  it("does not allow jumping again in midair", () => {
    const jump = new PovJump();
    jump.start();
    jump.step(0.05);
    const velocity = jump.velocity;
    jump.start();
    expect(jump.velocity).toBe(velocity);
  });
});

describe("hold E interaction", () => {
  it("fills before triggering, and triggers only once for one hold", () => {
    const hold = new TableHold();
    hold.start(7, 100);
    expect(hold.update(7, true, 425)).toEqual({
      progress: 0.5,
      completed: null,
    });
    expect(hold.update(7, true, 750)).toEqual({ progress: 1, completed: null });
    expect(hold.update(7, true, 850).completed).toBe(7);
    expect(hold.update(7, true, 900).completed).toBeNull();
  });
  it("cancels if E is released, another table is targeted, or availability changes", () => {
    const hold = new TableHold();
    hold.start(7, 0);
    hold.reset();
    expect(hold.update(7, true, 1000).completed).toBeNull();
    hold.start(7, 0);
    expect(hold.update(8, true, 500).progress).toBe(0);
    expect(hold.update(7, true, 1000).completed).toBeNull();
    hold.start(7, 0);
    expect(hold.update(7, false, 1000).completed).toBeNull();
  });
});

describe("POV table interaction", () => {
  const table = { userData: { tableId: 7 } };
  const tabletop = { isMesh: true, parent: table };
  it("finds the table owning the mesh under the crosshair, ignoring floating labels", () => {
    expect(
      tableInSight([
        { distance: 1, object: { isSprite: true } },
        { distance: 2, object: tabletop },
      ]),
    ).toBe(7);
  });
  it("does not interact through a wall or other physical object", () => {
    expect(
      tableInSight([
        { distance: 1, object: { isMesh: true } },
        { distance: 2, object: tabletop },
      ]),
    ).toBeNull();
  });
  it("requires a nearby table within interaction range", () => {
    expect(tableInSight([{ distance: 4, object: tabletop }])).toBeNull();
    expect(tableInSight([])).toBeNull();
  });
});
