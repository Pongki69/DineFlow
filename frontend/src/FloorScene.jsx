import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import {
  Component,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CanvasTexture,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import { chairPositions } from "./floorPlanGeometry";
import { PovJump, TableHold, tableInSight, walkInput } from "./walkNavigation";

function SceneLabel({
  text,
  position,
  color = "#294436",
  scale = [2.4, 0.5, 1],
  compact = false,
  fontSize = 36,
  visible = true,
  onClick,
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    if (compact) {
      context.beginPath();
      context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 48);
      context.fill();
      context.strokeStyle = "#ffffff55";
      context.lineWidth = 4;
      context.stroke();
    } else {
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.fillStyle = "#fff";
    context.font = `bold ${fontSize}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 384, 64, 740);
    return new CanvasTexture(canvas);
  }, [text, color, compact, fontSize]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite
      position={position}
      scale={scale}
      visible={visible}
      onClick={onClick}
    >
      <spriteMaterial map={texture} depthTest={false} />
    </sprite>
  );
}

const STATUS_COLORS = {
  available: "#438454",
  reserved: "#a97612",
  occupied: "#ad4c47",
  cleaning: "#5d7883",
  unavailable: "#656c68",
  selected: "#3966d8",
};
const STATUS_LABELS = {
  available: "Available",
  reserved: "Reserved",
  occupied: "Occupied",
  cleaning: "Cleaning",
  unavailable: "Unavailable",
};

function TableBadge({ object, status, selected, focused, walking, onClick }) {
  const sprite = useRef(null);
  const worldPosition = useMemo(() => new Vector3(), []);
  const expanded = walking;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = expanded ? 192 : 144;
    const context = canvas.getContext("2d");
    context.fillStyle = selected ? "#edf6ef" : "#fffefa";
    context.beginPath();
    context.roundRect(4, 4, 504, canvas.height - 8, 28);
    context.fill();
    context.strokeStyle = selected ? "#315b44" : "#d3ddd4";
    context.lineWidth = selected ? 7 : 3;
    context.stroke();
    context.textAlign = "left";
    context.textBaseline = "middle";
    const title =
      object.table?.table_number || object.label || `Table ${object.table_id}`;
    if (!expanded) {
      context.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.unavailable;
      context.beginPath();
      context.arc(40, 72, 13, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#20372c";
      context.font = '600 66px "Segoe UI", sans-serif';
      context.fillText(title, 72, 72, 412);
    } else {
      context.fillStyle = "#20372c";
      context.font = '600 52px "Segoe UI", sans-serif';
      context.fillText(title, 30, 61, 450);
      context.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.unavailable;
      context.beginPath();
      context.arc(39, 135, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#53645a";
      context.font = '400 38px "Segoe UI", sans-serif';
      context.fillText(
        `${STATUS_LABELS[status] || "Unavailable"} · ${object.table?.capacity || object.properties?.capacity || 2} seats`,
        64,
        135,
        418,
      );
    }
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [
    object.table?.table_number,
    object.table?.capacity,
    object.properties?.capacity,
    object.label,
    object.table_id,
    status,
    selected,
    expanded,
  ]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera, size }) => {
    if (!sprite.current) return;
    sprite.current.getWorldPosition(worldPosition);
    const distance = camera.position.distanceTo(worldPosition);
    // Keep labels readable without letting them expand as the guest approaches.
    const unitsPerPixel =
      (2 * Math.tan((camera.fov * Math.PI) / 360) * distance) /
      Math.max(1, size.height);
    const tableWidth = Math.max(
      Number(object.dimensions?.width) || 1.5,
      Number(object.dimensions?.depth) || 1.5,
    );
    const pixelWidth = walking
      ? 148
      : Math.max(64, Math.min(96, (tableWidth / unitsPerPixel) * 1.25));
    sprite.current.scale.set(
      pixelWidth * unitsPerPixel,
      (pixelWidth * unitsPerPixel * (expanded ? 192 : 144)) / 512,
      1,
    );
    sprite.current.visible = !walking || !focused;
  });
  return (
    <sprite
      ref={sprite}
      position={[0, walking ? 1.22 : 1.05, 0]}
      onClick={onClick}
    >
      <spriteMaterial
        map={texture}
        depthTest
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

function SceneObject({
  object,
  status,
  selected,
  selectionId,
  selectable,
  onSelect,
  nextSlot,
  reservationMode = false,
  walking = false,
  focused = false,
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps = {
    onPointerEnter: () => {
      setHovered(true);
      if (selectable) document.body.style.cursor = "pointer";
    },
    onPointerLeave: () => {
      setHovered(false);
      document.body.style.cursor = "";
    },
  };
  const select = () => {
    if (selectable) onSelect?.(selectionId);
  };
  const p = object.position || { x: 0, z: 0 };
  const d = object.dimensions || { width: 1.5, depth: 1.3, height: 0.8 };
  const size = (value, fallback) =>
    Number.isFinite(Number(value)) ? Math.max(0.04, Number(value)) : fallback;
  const color = selected
    ? STATUS_COLORS.selected
    : STATUS_COLORS[status] || "#a78d6c";
  const longTable = object.properties?.table_shape === "long";
  if (object.object_type === "wall") {
    const width = size(d.width, 4);
    const depth = size(d.depth, 0.24);
    const height = size(d.height, 2.2);
    return (
      <group
        position={[p.x || 0, 0, p.z || 0]}
        rotation={[0, object.rotation?.y || 0, 0]}
        {...hoverProps}
      >
        <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[size(d.width, 4), height, size(d.depth, 0.24)]} />
          <meshStandardMaterial color="#d5d0c5" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.08, depth * 0.52]} castShadow>
          <boxGeometry args={[width, 0.16, 0.06]} />
          <meshStandardMaterial color="#9b8b73" roughness={0.72} />
        </mesh>
        <mesh position={[0, height + 0.035, 0]}>
          <boxGeometry args={[width + 0.04, 0.07, depth + 0.04]} />
          <meshStandardMaterial color="#e6e0d4" roughness={0.8} />
        </mesh>
        <SceneLabel
          text={object.label || "WALL"}
          color={selected ? STATUS_COLORS.selected : "#765f45"}
          position={[0, height + 0.28, 0]}
          scale={[1.3, 0.28, 1]}
          compact
          visible={!reservationMode && (hovered || selected)}
          onClick={select}
        />
      </group>
    );
  }
  if (object.object_type === "flooring") {
    const width = size(d.width, 4);
    const depth = size(d.depth, 4);
    const columns = Math.max(0, Math.floor(width) - 1);
    const rows = Math.max(0, Math.floor(depth) - 1);
    return (
      <group
        position={[p.x || 0, 0, p.z || 0]}
        rotation={[0, object.rotation?.y || 0, 0]}
        {...hoverProps}
      >
        <mesh position={[0, -0.05, 0]} receiveShadow>
          <boxGeometry args={[size(d.width, 4), 0.06, size(d.depth, 4)]} />
          <meshStandardMaterial
            color={object.properties?.floor_color || "#c7ad84"}
            roughness={0.88}
          />
        </mesh>
        {Array.from({ length: columns }, (_, i) => (
          <mesh
            key={`floor-seam-x-${i}`}
            position={[-width / 2 + i + 1, -0.017, 0]}
          >
            <boxGeometry args={[0.018, 0.004, Math.max(0.1, depth - 0.04)]} />
            <meshStandardMaterial color="#967d5d" roughness={1} />
          </mesh>
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <mesh
            key={`floor-seam-z-${i}`}
            position={[0, -0.017, -depth / 2 + i + 1]}
          >
            <boxGeometry args={[Math.max(0.1, width - 0.04), 0.004, 0.018]} />
            <meshStandardMaterial color="#967d5d" roughness={1} />
          </mesh>
        ))}
        <SceneLabel
          text={object.label || "FLOOR PANEL"}
          color={selected ? STATUS_COLORS.selected : "#765f45"}
          position={[0, 0.18, 0]}
          scale={[1.35, 0.26, 1]}
          compact
          visible={!reservationMode && (hovered || selected)}
          onClick={select}
        />
      </group>
    );
  }
  if (object.object_type === "door") {
    const width = size(d.width, 1.1);
    const depth = size(d.depth, 0.14);
    const height = size(d.height, 2.1);
    return (
      <group
        position={[p.x || 0, 0, p.z || 0]}
        rotation={[0, object.rotation?.y || 0, 0]}
        {...hoverProps}
      >
        <mesh position={[-width / 2 + 0.05, height / 2, 0]} castShadow>
          <boxGeometry args={[0.1, height, depth * 1.5]} />
          <meshStandardMaterial color="#786047" roughness={0.82} />
        </mesh>
        <mesh position={[width / 2 - 0.05, height / 2, 0]} castShadow>
          <boxGeometry args={[0.1, height, depth * 1.5]} />
          <meshStandardMaterial color="#786047" roughness={0.82} />
        </mesh>
        <mesh position={[0, height - 0.05, 0]} castShadow>
          <boxGeometry args={[width, 0.1, depth * 1.5]} />
          <meshStandardMaterial color="#786047" roughness={0.82} />
        </mesh>
        <group position={[-width / 2 + 0.1, 0, 0]} rotation={[0, -0.72, 0]}>
          <mesh
            position={[(width - 0.14) / 2, height / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[width - 0.14, height - 0.12, depth]} />
            <meshStandardMaterial color="#9a704b" roughness={0.7} />
          </mesh>
          <mesh position={[width - 0.3, height * 0.48, depth / 2 + 0.035]}>
            <sphereGeometry args={[0.055, 12, 10]} />
            <meshStandardMaterial
              color="#d5b36c"
              metalness={0.65}
              roughness={0.3}
            />
          </mesh>
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <planeGeometry args={[width + 0.2, depth + 0.2]} />
          <meshStandardMaterial color="#d9bd8e" roughness={0.9} />
        </mesh>
        <SceneLabel
          text={object.label || "DOOR"}
          color={selected ? STATUS_COLORS.selected : "#765f45"}
          position={[0, height + 0.2, 0]}
          scale={[1.2, 0.24, 1]}
          compact
          visible={!reservationMode && (hovered || selected)}
          onClick={select}
        />
      </group>
    );
  }
  if (object.object_type === "entrance")
    return (
      <group
        position={[p.x || 0, 0.03, p.z || 0]}
        {...hoverProps}
        onClick={select}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size(d.width, 2.2), size(d.depth, 0.4)]} />
          <meshStandardMaterial color="#c9dfd1" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.24, 3]} />
          <meshStandardMaterial color="#3e7654" />
        </mesh>
        <SceneLabel
          text={object.label || "ENTRY"}
          color={selected ? STATUS_COLORS.selected : "#765f45"}
          position={[0, 0.18, 0]}
          scale={[1.05, 0.22, 1]}
          compact
          visible={hovered || selected}
          onClick={select}
        />
      </group>
    );
  if (object.object_type !== "table")
    return (
      <group
        position={[p.x || 0, 0.25, p.z || 0]}
        {...hoverProps}
        onClick={select}
      >
        <mesh>
          <boxGeometry
            args={[size(d.width, 1.6), size(d.height, 0.5), size(d.depth, 1)]}
          />
          <meshStandardMaterial
            color={object.object_type === "counter" ? "#907359" : "#b6a58d"}
          />
        </mesh>
        <SceneLabel
          text={object.label || object.object_type}
          position={[0, (d.height || 0.5) + 0.18, 0]}
          scale={[1.3, 0.24, 1]}
          compact
          visible={!reservationMode && (hovered || selected)}
          color={selected ? STATUS_COLORS.selected : "#765f45"}
          onClick={select}
        />
      </group>
    );
  const capacity = object.table?.capacity || object.properties?.capacity || 2;
  const seats = chairPositions(
    object.properties?.table_shape || "short",
    capacity,
    object.properties?.chair_layout,
    d,
  );
  const seatedAt = object.table?.current_session?.opened_at
    ? new Date(object.table.current_session.opened_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const estimate = object.table?.expected_available_at
    ? new Date(object.table.expected_available_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const nextSlotLabel = nextSlot
    ? new Date(nextSlot).toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <group
      userData={{ tableId: object.table_id }}
      position={[p.x || 0, 0, p.z || 0]}
      rotation={[0, object.rotation?.y || 0, 0]}
      {...hoverProps}
      onClick={(e) => {
        e.stopPropagation();
        select();
      }}
    >
      {longTable ? (
        <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
          <boxGeometry args={[d.width || 2.4, 0.14, d.depth || 1.15]} />
          <meshStandardMaterial
            color={selected ? "#86b4a0" : "#bba079"}
            roughness={0.72}
          />
        </mesh>
      ) : (
        <mesh
          position={[0, 0.76, 0]}
          scale={[1, 1, (d.depth || 1.45) / (d.width || 1.45)]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry
            args={[(d.width || 1.45) / 2, (d.width || 1.45) / 2, 0.14, 32]}
          />
          <meshStandardMaterial
            color={selected ? "#86b4a0" : "#bba079"}
            roughness={0.72}
          />
        </mesh>
      )}
      {longTable ? (
        <>
          {[-1, 1].map((side) => (
            <mesh
              key={`leg-${side}`}
              position={[side * (d.width || 2.4) * 0.34, 0.38, 0]}
              castShadow
            >
              <boxGeometry args={[0.11, 0.72, 0.11]} />
              <meshStandardMaterial color="#765b43" />
            </mesh>
          ))}
          {seats.map((seat, i) => (
            <Chair
              key={i}
              position={[seat.x, 0, seat.z]}
              rotation={[0, seat.rotation, 0]}
            />
          ))}
        </>
      ) : (
        <>
          <mesh position={[0, 0.39, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.16, 0.72, 12]} />
            <meshStandardMaterial color="#765b43" />
          </mesh>
          {seats.map((seat, i) => (
            <Chair
              key={i}
              position={[seat.x, 0, seat.z]}
              rotation={[0, seat.rotation, 0]}
            />
          ))}
        </>
      )}
      <TableBadge
        object={object}
        status={status}
        selected={selected}
        walking={walking}
        focused={focused}
        onClick={select}
      />
      {!reservationMode && (estimate || nextSlotLabel) && (
        <SceneLabel
          text={
            estimate
              ? `Est. available ${estimate}`
              : `Next slot ${nextSlotLabel}`
          }
          color="#42564a"
          position={[0, 1.48, 0]}
          scale={[1.8, 0.24, 1]}
          compact
          fontSize={30}
        />
      )}
      {!reservationMode && seatedAt && (
        <SceneLabel text={`Seated since ${seatedAt}`} position={[0, 1.5, 0]} />
      )}
    </group>
  );
}

function Chair({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.38, 0.1, 0.38]} />
        <meshStandardMaterial color="#a87950" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.48, -0.16]} castShadow>
        <boxGeometry args={[0.38, 0.42, 0.08]} />
        <meshStandardMaterial color="#966b48" roughness={0.82} />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}-${z}`} position={[x * 0.13, 0.12, z * 0.13]}>
            <boxGeometry args={[0.055, 0.24, 0.055]} />
            <meshStandardMaterial color="#684d38" />
          </mesh>
        )),
      )}
    </group>
  );
}

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status">
        3D is unavailable on this device. Use the Accessible 2D view to choose a
        table.
      </p>
    ) : (
      this.props.children
    );
  }
}

export function FloorScene(props) {
  return (
    <SceneBoundary>
      <FloorCanvas {...props} />
    </SceneBoundary>
  );
}

function WalkNavigation({ mode, locked }) {
  const { camera } = useThree();
  const keys = useRef(new Set());
  const jump = useMemo(() => new PovJump(), []);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (mode === "orbit") return undefined;
    const eyeHeight = mode === "pov" ? 1.65 : 3;
    camera.position.set(0, eyeHeight, 7);
    camera.lookAt(0, mode === "pov" ? eyeHeight : 2, 0);
  }, [mode, camera]);
  useEffect(() => {
    if (mode === "orbit" || !locked) {
      keys.current.clear();
      return undefined;
    }
    const onKeyDown = (event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (mode === "pov" && event.code === "Space" && !event.repeat)
        jump.start();
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "ControlLeft",
          "ControlRight",
        ].includes(event.code)
      ) {
        keys.current.add(event.code);
        event.preventDefault();
      }
    };
    const onKeyUp = (event) => keys.current.delete(event.code);
    const clearKeys = () => keys.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      clearKeys();
    };
  }, [mode, locked, jump]);
  useFrame((_, delta) => {
    if (mode === "orbit" || !locked) return;
    const keysDown = keys.current;
    const { forward: forwardAmount, side: sideAmount } = walkInput(keysDown);
    const verticalAmount =
      Number(keysDown.has("Space")) -
      Number(keysDown.has("ShiftLeft") || keysDown.has("ShiftRight"));
    if (
      !forwardAmount &&
      !sideAmount &&
      !(mode === "creative" && verticalAmount) &&
      !(mode === "pov" && (jump.height > 0 || jump.velocity > 0))
    )
      return;
    camera.getWorldDirection(forward);
    if (mode === "pov") forward.y = 0;
    forward.normalize();
    if (mode === "pov") right.crossVectors(forward, camera.up).normalize();
    else right.set(-forward.z, 0, forward.x).normalize();
    const sprint =
      mode === "creative" &&
      (keysDown.has("ControlLeft") || keysDown.has("ControlRight"));
    const speed =
      (sprint ? 9 : mode === "creative" ? 5.5 : 4) * Math.min(delta, 0.05);
    camera.position.addScaledVector(forward, forwardAmount * speed);
    camera.position.addScaledVector(right, sideAmount * speed);
    if (mode === "creative") {
      camera.position.y = Math.max(
        0.25,
        Math.min(24, camera.position.y + verticalAmount * speed),
      );
    } else {
      camera.position.y = 1.65 + jump.step(delta);
    }
  });
  return null;
}

function TableInteraction({
  enabled,
  world,
  availability,
  onInteract,
  onTarget,
  onProgress,
}) {
  const { camera } = useThree();
  const ray = useMemo(() => new Raycaster(), []);
  const center = useMemo(() => new Vector2(0, 0), []);
  const target = useRef(null);
  const elapsed = useRef(0);
  const hold = useMemo(() => new TableHold(), []);
  function findTarget() {
    if (!world.current) return null;
    ray.setFromCamera(center, camera);
    ray.far = 3.5;
    return tableInSight(ray.intersectObjects(world.current.children, true));
  }
  useFrame((_, delta) => {
    if (!enabled) return;
    elapsed.current += delta;
    if (!hold.active && elapsed.current < 0.1) return;
    elapsed.current = 0;
    const id = findTarget();
    if (target.current !== id) {
      target.current = id;
      onTarget(id);
    }
    const available = availability.some(
      (table) => String(table.id) === String(id) && table.available,
    );
    const result = hold.update(id, available, performance.now());
    onProgress(Math.round(result.progress * 100));
    if (result.completed != null) {
      if (document.pointerLockElement) document.exitPointerLock();
      onInteract(result.completed);
    }
  });
  useEffect(() => {
    const cancel = () => {
      hold.reset();
      onProgress(0);
    };
    if (!enabled) {
      target.current = null;
      onTarget(null);
      cancel();
      return undefined;
    }
    const interact = (event) => {
      if (
        event.code !== "KeyE" ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      const id = findTarget();
      if (
        !availability.some(
          (table) => String(table.id) === String(id) && table.available,
        )
      )
        return;
      event.preventDefault();
      hold.start(id, performance.now());
    };
    const release = (event) => {
      if (event.code === "KeyE") cancel();
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("keydown", interact);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", interact);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      hold.reset();
    };
  }, [enabled, availability, onInteract, onTarget, onProgress, camera, hold]);
  return null;
}

function FloorCanvas({
  objects = [],
  availability = [],
  selectedId,
  onSelect,
  selectLayoutObjects = false,
  reservationMode = false,
  onInteract,
  bookingOverlay,
  bookingOpen = false,
  resumeControls,
}) {
  const sceneRef = useRef(null);
  const nativeFullscreen = useRef(false);
  const [immersive, setImmersive] = useState(false);
  const controlsRef = useRef(null);
  const pointerControlsRef = useRef(null);
  const world = useRef(null);
  const [targetId, setTargetId] = useState(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [navigationMode, setNavigationMode] = useState("orbit");
  const [mouseLocked, setMouseLocked] = useState(false);
  const byId = new Map(availability.map((item) => [item.id, item]));
  const targetTable = availability.find(
    (table) => String(table.id) === String(targetId),
  );
  function resumeWalking() {
    if (navigationMode !== "pov") return;
    try {
      // Drei can connect to R3F's event container rather than its canvas.
      // Capturing a different element leaves the controls in the unlocked state.
      const request =
        pointerControlsRef.current?.domElement?.requestPointerLock?.();
      request?.catch(() => {});
    } catch {
      /* The visible Resume button lets the guest retry with a fresh click. */
    }
  }
  useImperativeHandle(resumeControls, () => ({ resume: resumeWalking }), [
    navigationMode,
  ]);
  useEffect(() => {
    const changed = () => {
      if (document.fullscreenElement === sceneRef.current) {
        nativeFullscreen.current = true;
      } else if (nativeFullscreen.current) {
        nativeFullscreen.current = false;
        setImmersive(false);
        setNavigationMode("orbit");
        setMouseLocked(false);
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!immersive) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [immersive]);
  async function enterPov() {
    if (reservationMode) {
      setImmersive(true);
      try {
        await sceneRef.current.requestFullscreen?.();
      } catch {
        /* Keep the full-window view when native fullscreen is unavailable. */
      }
    }
    setNavigationMode("pov");
  }
  function exitNavigation() {
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement === sceneRef.current)
      document.exitFullscreen().catch(() => {});
    setImmersive(false);
    setMouseLocked(false);
    setNavigationMode("orbit");
  }
  return (
    <div
      ref={sceneRef}
      className={`floor-scene${immersive ? " is-immersive" : ""}${navigationMode !== "orbit" ? " is-walking" : ""}`}
    >
      <div className="scene-toolbar">
        <div>
          <strong>
            {navigationMode === "pov"
              ? "Explore the restaurant"
              : "3D floor preview"}
          </strong>
          <span>
            {navigationMode === "creative"
              ? mouseLocked
                ? "WASD move · mouse look · Space up · Shift down · Ctrl sprint · Esc exit"
                : "Click the scene · WASD move · Space up · Shift down · Ctrl sprint · Esc exit"
              : navigationMode === "pov"
                ? `${mouseLocked ? "" : "Click the scene · "}W forward · S backward · A/D strafe · Space jump · mouse look${reservationMode ? " · Hold E to book" : ""} · Esc exit`
                : "Drag to orbit · scroll to zoom · right-drag to pan"}
          </span>
        </div>
        <div className="scene-toolbar-actions">
          {navigationMode === "orbit" ? (
            <>
              <button
                type="button"
                onClick={() => setNavigationMode("creative")}
                title="Free-fly with keyboard and mouse; Space rises and Shift descends"
              >
                Creative fly
              </button>
              <button
                type="button"
                onClick={enterPov}
                title="Walk at eye level through the restaurant"
              >
                POV immersive
              </button>
              <button
                type="button"
                onClick={() => {
                  const controls = controlsRef.current;
                  if (!controls) return;
                  controls.object.position.set(0, 24, 0.01);
                  controls.target.set(0, 0, 0);
                  controls.update();
                }}
                title="See the floor layout from directly above"
              >
                Top view
              </button>
              <button
                type="button"
                onClick={() => controlsRef.current?.reset()}
                title="Reset camera"
              >
                Reset view
              </button>
            </>
          ) : (
            <button
              type="button"
              className="is-active"
              onClick={exitNavigation}
              title="Exit keyboard and mouse navigation"
            >
              Exit {navigationMode === "creative" ? "creative" : "POV"}
            </button>
          )}
        </div>
      </div>
      <Canvas
        fallback={
          <p>
            3D is unavailable. Use the Accessible 2D view to choose a table.
          </p>
        }
        camera={{ position: [9, 12, 11], fov: 38 }}
        dpr={[1, 1.75]}
        shadows
        onCreated={({ gl }) => {
          gl.domElement.id = "dineflow-walk-canvas";
        }}
      >
        <color attach="background" args={["#f2f3ee"]} />
        <hemisphereLight args={["#fffaf0", "#777366", 0.7]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 11, 7]} intensity={2} castShadow />
        <group ref={world}>
          {objects.map((object) => (
            <SceneObject
              key={object.id || `${object.object_type}-${object.label}`}
              object={object}
              status={
                byId.get(object.table_id)?.status ||
                (reservationMode && object.object_type === "table"
                  ? "unavailable"
                  : object.table?.operational_status || "available")
              }
              estimateMinutes={
                byId.get(object.table_id)?.estimated_remaining_minutes
              }
              nextSlot={byId.get(object.table_id)?.next_schedulable_slot}
              selected={
                !(reservationMode && navigationMode === "pov") &&
                (Array.isArray(selectedId)
                  ? selectedId.some(
                      (id) =>
                        String(id) ===
                        String(
                          selectLayoutObjects
                            ? (object.id ?? object._key)
                            : object.table_id,
                        ),
                    )
                  : selectedId ===
                    (selectLayoutObjects
                      ? (object.id ?? object._key)
                      : object.table_id))
              }
              selectionId={
                selectLayoutObjects
                  ? (object.id ?? object._key)
                  : object.table_id
              }
              selectable={
                navigationMode === "orbit" &&
                (selectLayoutObjects ||
                  (object.object_type === "table" &&
                    Boolean(byId.get(object.table_id)?.available)))
              }
              onSelect={onSelect}
              reservationMode={reservationMode}
              walking={navigationMode !== "orbit"}
              focused={
                navigationMode === "pov" &&
                mouseLocked &&
                object.table_id === targetId &&
                Boolean(byId.get(object.table_id)?.available)
              }
            />
          ))}
        </group>
        {reservationMode && onInteract && (
          <TableInteraction
            enabled={navigationMode === "pov" && !bookingOpen}
            world={world}
            availability={availability}
            onInteract={onInteract}
            onTarget={setTargetId}
            onProgress={setHoldProgress}
          />
        )}
        {navigationMode !== "orbit" ? (
          <>
            <PointerLockControls
              ref={pointerControlsRef}
              selector="#dineflow-walk-canvas"
              makeDefault
              onLock={() => setMouseLocked(true)}
              onUnlock={() => setMouseLocked(false)}
            />
            <WalkNavigation
              mode={navigationMode}
              locked={!bookingOpen && (mouseLocked || navigationMode === "pov")}
            />
          </>
        ) : (
          <OrbitControls
            ref={controlsRef}
            makeDefault
            target={[0, 0, 0]}
            minPolarAngle={0.02}
            maxPolarAngle={1.42}
            minDistance={7}
            maxDistance={28}
            enableDamping
          />
        )}
      </Canvas>
      {navigationMode === "pov" && !mouseLocked && !bookingOpen && (
        <div className="pov-resume-overlay">
          <button
            type="button"
            className="pov-resume-button"
            onClick={resumeWalking}
          >
            Enable mouse look
            <span>WASD and Space are ready · Click to capture the mouse</span>
          </button>
        </div>
      )}
      {navigationMode === "pov" && !bookingOpen && reservationMode && (
        <div className="pov-interaction" aria-live="polite">
          {targetTable?.available ? (
            <div className="pov-table-prompt">
              <span
                className="pov-interaction-key"
                style={{ "--hold-progress": `${holdProgress}%` }}
                aria-hidden="true"
              >
                <span>E</span>
              </span>
              <div>
                <strong>{targetTable.table_number}</strong>
                <span>Hold E to book this table</span>
              </div>
              <span
                className="pov-hold-progress"
                role="progressbar"
                aria-label="Hold E to interact"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={holdProgress}
              />
            </div>
          ) : (
            <>
              <span className="pov-crosshair" aria-hidden="true" />
              {targetTable && (
                <span className="pov-interaction-hint">
                  {targetTable.table_number} · Unavailable for this time
                </span>
              )}
            </>
          )}
        </div>
      )}
      <div className="floor-legend">
        {Object.entries(STATUS_COLORS)
          .filter(([key]) => key !== "selected")
          .map(([status, color]) => (
            <span key={status}>
              <i style={{ background: color }} />
              {STATUS_LABELS[status] || status}
            </span>
          ))}
      </div>
      {bookingOverlay}
    </div>
  );
}
