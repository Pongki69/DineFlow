// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { FloorScene } from "./FloorScene";

const frames = vi.hoisted(() => []);
const camera = vi.hoisted(() => ({
  position: { set: vi.fn(), addScaledVector: vi.fn() },
  lookAt: vi.fn(),
  getWorldDirection: vi.fn((out) => out.set(0, 0, -1)),
  up: { x: 0, y: 1, z: 0 },
}));
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }) => (
    <>
      <canvas data-testid="scene-canvas" />
      {React.Children.toArray(children).filter(
        (child) => child.type === React.Fragment,
      )}
    </>
  ),
  useFrame: (callback) => {
    frames.push(callback);
  },
  useThree: () => ({ camera }),
}));
vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
  PointerLockControls: React.forwardRef(function MockPointerControls(
    { onUnlock, onLock },
    ref,
  ) {
    const connected = React.useRef(null);
    React.useImperativeHandle(ref, () => ({ domElement: connected.current }));
    React.useEffect(() => {
      const changed = () =>
        document.pointerLockElement === connected.current
          ? onLock()
          : onUnlock();
      document.addEventListener("pointerlockchange", changed);
      return () => document.removeEventListener("pointerlockchange", changed);
    }, [onLock, onUnlock]);
    return (
      <div ref={connected} data-testid="controls-event-container">
        <button onClick={onUnlock}>Pause mouse look</button>
        <button onClick={onLock}>Capture mouse look</button>
      </div>
    );
  }),
}));

beforeEach(() => {
  frames.length = 0;
  HTMLCanvasElement.prototype.requestPointerLock = vi.fn(() =>
    Promise.resolve(),
  );
  Object.defineProperty(document, "pointerLockElement", {
    configurable: true,
    value: null,
    writable: true,
  });
  Element.prototype.requestPointerLock = vi.fn(function () {
    document.pointerLockElement = this;
    document.dispatchEvent(new Event("pointerlockchange"));
    return Promise.resolve();
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
    writable: true,
  });
  Element.prototype.requestFullscreen = vi.fn(function () {
    document.fullscreenElement = this;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  document.exitFullscreen = vi.fn(async () => {
    document.fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("enters fullscreen and keeps the same POV position when mouse capture pauses for booking", async () => {
  render(
    <FloorScene
      reservationMode
      bookingOverlay={<dialog data-testid="booking-overlay" />}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "POV immersive" }));
  await screen.findByRole("button", { name: "Exit POV" });
  const scene = document.fullscreenElement;
  expect(scene.classList.contains("is-immersive")).toBe(true);
  expect(scene.contains(screen.getByTestId("booking-overlay"))).toBe(true);
  expect(camera.position.set).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Pause mouse look" }));
  expect(document.fullscreenElement).toBe(scene);
  expect(document.exitFullscreen).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Exit POV" })).toBeTruthy();
  expect(camera.position.set).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Exit POV" }));
  await waitFor(() => expect(document.fullscreenElement).toBeNull());
  expect(scene.classList.contains("is-immersive")).toBe(false);
  expect(document.body.style.overflow).not.toBe("hidden");
});

it("returns to the normal view when browser fullscreen is exited", async () => {
  render(<FloorScene reservationMode />);
  fireEvent.click(screen.getByRole("button", { name: "POV immersive" }));
  await screen.findByRole("button", { name: "Exit POV" });
  await document.exitFullscreen();
  await screen.findByRole("button", { name: "POV immersive" });
  expect(document.querySelector(".is-immersive")).toBeNull();
});

it("expands the scene when native fullscreen is unavailable", async () => {
  Element.prototype.requestFullscreen = vi.fn(() =>
    Promise.reject(new Error("Unavailable")),
  );
  render(<FloorScene reservationMode />);
  fireEvent.click(screen.getByRole("button", { name: "POV immersive" }));
  await screen.findByRole("button", { name: "Exit POV" });
  expect(document.querySelector(".is-immersive")).toBeTruthy();
});

it("provides a direct resume action when pointer capture is paused after booking", async () => {
  render(<FloorScene reservationMode />);
  fireEvent.click(screen.getByRole("button", { name: "POV immersive" }));
  await screen.findByRole("button", { name: "Exit POV" });
  fireEvent.click(screen.getByRole("button", { name: /Enable mouse look/ }));
  expect(Element.prototype.requestPointerLock).toHaveBeenCalledTimes(1);
  expect(HTMLCanvasElement.prototype.requestPointerLock).not.toHaveBeenCalled();
  expect(document.pointerLockElement).toBe(
    screen.getByTestId("controls-event-container"),
  );
  expect(
    screen.queryByRole("button", { name: /Enable mouse look/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pause mouse look" }));
  expect(
    screen.getByRole("button", { name: /Enable mouse look/ }),
  ).toBeTruthy();
  expect(document.fullscreenElement).not.toBeNull();
});

it("resumes WASD and jumping after booking closes even when pointer lock is unavailable", async () => {
  const view = render(<FloorScene reservationMode bookingOpen={false} />);
  fireEvent.click(screen.getByRole("button", { name: "POV immersive" }));
  await screen.findByRole("button", { name: "Exit POV" });
  view.rerender(<FloorScene reservationMode bookingOpen />);
  camera.position.addScaledVector.mockClear();
  fireEvent.keyDown(window, { code: "KeyW" });
  frames.at(-1)({}, 1 / 60);
  expect(camera.position.addScaledVector).not.toHaveBeenCalled();
  view.rerender(<FloorScene reservationMode bookingOpen={false} />);
  fireEvent.keyDown(window, { code: "KeyW" });
  frames.at(-1)({}, 1 / 60);
  expect(camera.position.addScaledVector).toHaveBeenCalledWith(
    expect.objectContaining({ z: -1 }),
    expect.any(Number),
  );
  fireEvent.keyUp(window, { code: "KeyW" });
  fireEvent.keyDown(window, { code: "Space" });
  frames.at(-1)({}, 1 / 60);
  expect(camera.position.y).toBeGreaterThan(1.65);
  expect(document.pointerLockElement).toBeNull();
  expect(camera.position.set).toHaveBeenCalledTimes(1);
});
