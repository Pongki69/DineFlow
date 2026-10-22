import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, Vector3 } from "three";
import { chairPositions } from "./floorPlanGeometry";

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
    <sprite position={position} scale={scale} visible={visible} onClick={onClick}>
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

function SceneObject({ object, status, selected, selectionId, selectable, onSelect, nextSlot, reservationMode = false }) {
  const [hovered, setHovered] = useState(false);
  const hoverProps = {
    onPointerEnter: () => { setHovered(true); if (selectable) document.body.style.cursor = "pointer"; },
    onPointerLeave: () => { setHovered(false); document.body.style.cursor = ""; },
  };
  const select = () => { if (selectable) onSelect?.(selectionId); };
  const p = object.position || { x: 0, z: 0 };
  const d = object.dimensions || { width: 1.5, depth: 1.3, height: 0.8 };
  const size = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0.04, Number(value)) : fallback;
  const color = selected
    ? STATUS_COLORS.selected
    : STATUS_COLORS[status] || "#a78d6c";
  const longTable = object.properties?.table_shape === "long";
  if (object.object_type === "wall") {
    const width = size(d.width, 4);
    const depth = size(d.depth, 0.24);
    const height = size(d.height, 2.2);
    return (
      <group position={[p.x || 0, 0, p.z || 0]} rotation={[0, object.rotation?.y || 0, 0]} {...hoverProps}>
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
        <SceneLabel text={object.label || "WALL"} color={selected ? STATUS_COLORS.selected : "#765f45"} position={[0, height + 0.28, 0]} scale={[1.3, 0.28, 1]} compact visible={!reservationMode && (hovered || selected)} onClick={select} />
      </group>
    );
  }
  if (object.object_type === "flooring") {
    const width = size(d.width, 4);
    const depth = size(d.depth, 4);
    const columns = Math.max(0, Math.floor(width) - 1);
    const rows = Math.max(0, Math.floor(depth) - 1);
    return (
      <group position={[p.x || 0, 0, p.z || 0]} rotation={[0, object.rotation?.y || 0, 0]} {...hoverProps}>
        <mesh position={[0, -0.05, 0]} receiveShadow>
          <boxGeometry args={[size(d.width, 4), 0.06, size(d.depth, 4)]} />
          <meshStandardMaterial color={object.properties?.floor_color || "#c7ad84"} roughness={0.88} />
        </mesh>
        {Array.from({ length: columns }, (_, i) => (
          <mesh key={`floor-seam-x-${i}`} position={[-width / 2 + i + 1, -0.017, 0]}>
            <boxGeometry args={[0.018, 0.004, Math.max(0.1, depth - 0.04)]} />
            <meshStandardMaterial color="#967d5d" roughness={1} />
          </mesh>
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <mesh key={`floor-seam-z-${i}`} position={[0, -0.017, -depth / 2 + i + 1]}>
            <boxGeometry args={[Math.max(0.1, width - 0.04), 0.004, 0.018]} />
            <meshStandardMaterial color="#967d5d" roughness={1} />
          </mesh>
        ))}
        <SceneLabel text={object.label || "FLOOR PANEL"} color={selected ? STATUS_COLORS.selected : "#765f45"} position={[0, 0.18, 0]} scale={[1.35, 0.26, 1]} compact visible={!reservationMode && (hovered || selected)} onClick={select} />
      </group>
    );
  }
  if (object.object_type === "door") {
    const width = size(d.width, 1.1);
    const depth = size(d.depth, 0.14);
    const height = size(d.height, 2.1);
    return (
      <group position={[p.x || 0, 0, p.z || 0]} rotation={[0, object.rotation?.y || 0, 0]} {...hoverProps}>
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
          <mesh position={[(width - 0.14) / 2, height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[width - 0.14, height - 0.12, depth]} />
            <meshStandardMaterial color="#9a704b" roughness={0.7} />
          </mesh>
          <mesh position={[width - 0.3, height * 0.48, depth / 2 + 0.035]}>
            <sphereGeometry args={[0.055, 12, 10]} />
            <meshStandardMaterial color="#d5b36c" metalness={0.65} roughness={0.3} />
          </mesh>
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <planeGeometry args={[width + 0.2, depth + 0.2]} />
          <meshStandardMaterial color="#d9bd8e" roughness={0.9} />
        </mesh>
        <SceneLabel text={object.label || "DOOR"} color={selected ? STATUS_COLORS.selected : "#765f45"} position={[0, height + 0.2, 0]} scale={[1.2, 0.24, 1]} compact visible={!reservationMode && (hovered || selected)} onClick={select} />
      </group>
    );
  }
  if (object.object_type === "entrance")
    return (
      <group position={[p.x || 0, 0.03, p.z || 0]} {...hoverProps} onClick={select}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size(d.width, 2.2), size(d.depth, 0.4)]} />
          <meshStandardMaterial color="#c9dfd1" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.24, 3]} />
          <meshStandardMaterial color="#3e7654" />
        </mesh>
        <SceneLabel text={object.label || "ENTRY"} color={selected ? STATUS_COLORS.selected : "#765f45"} position={[0, 0.18, 0]} scale={[1.05, 0.22, 1]} compact visible={hovered || selected} onClick={select} />
      </group>
    );
  if (object.object_type !== "table")
    return (
      <group position={[p.x || 0, 0.25, p.z || 0]} {...hoverProps} onClick={select}>
        <mesh>
          <boxGeometry args={[size(d.width, 1.6), size(d.height, 0.5), size(d.depth, 1)]} />
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
  const seats = chairPositions(object.properties?.table_shape || "short", capacity, object.properties?.chair_layout, d);
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
          <meshStandardMaterial color={color} roughness={0.62} />
        </mesh>
      ) : (
        <mesh position={[0, 0.76, 0]} scale={[1, 1, (d.depth || 1.45) / (d.width || 1.45)]} castShadow receiveShadow>
          <cylinderGeometry args={[(d.width || 1.45) / 2, (d.width || 1.45) / 2, 0.14, 32]} />
          <meshStandardMaterial color={color} roughness={0.62} />
        </mesh>
      )}
      {longTable ? (
        <>
          {[-1, 1].map((side) => <mesh key={`leg-${side}`} position={[side * (d.width || 2.4) * 0.34, 0.38, 0]} castShadow><boxGeometry args={[0.11, 0.72, 0.11]} /><meshStandardMaterial color="#765b43" /></mesh>)}
          {seats.map((seat, i) => <Chair key={i} position={[seat.x, 0, seat.z]} rotation={[0, seat.rotation, 0]} />)}
        </>
      ) : (
        <>
          <mesh position={[0, 0.39, 0]} castShadow><cylinderGeometry args={[0.11, 0.16, 0.72, 12]} /><meshStandardMaterial color="#765b43" /></mesh>
          {seats.map((seat, i) => <Chair key={i} position={[seat.x, 0, seat.z]} rotation={[0, seat.rotation, 0]} />)}
        </>
      )}
      <SceneLabel
        text={
          object.table?.table_number || object.label || `T${object.table_id}`
        }
        position={[0, reservationMode ? 1.12 : 0.65, 0]}
        scale={reservationMode ? [1.55, 0.38, 1] : [0.95, 0.22, 1]}
        compact
        fontSize={reservationMode ? 48 : 36}
        onClick={select}
      />
      <SceneLabel
        text={!reservationMode && selected ? "Selected" : (STATUS_LABELS[status] || STATUS_LABELS.unavailable).toUpperCase()}
        color={color}
        position={[0, reservationMode ? 1.52 : 1.12, 0]}
        scale={reservationMode ? [1.65, 0.34, 1] : [1.35, 0.28, 1]}
        compact
        fontSize={reservationMode ? 38 : 36}
      />
      {!reservationMode && (estimate || nextSlotLabel) && <SceneLabel
        text={estimate ? `Est. available ${estimate}` : `Next slot ${nextSlotLabel}`}
        color="#42564a"
        position={[0, 1.48, 0]}
        scale={[1.8, 0.24, 1]}
        compact
        fontSize={30}
      />}
      {!reservationMode && seatedAt && (
        <SceneLabel text={`Seated since ${seatedAt}`} position={[0, 1.5, 0]} />
      )}
    </group>
  );
}

function Chair({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.25, 0]} castShadow><boxGeometry args={[0.38, 0.1, 0.38]} /><meshStandardMaterial color="#a87950" roughness={0.82} /></mesh>
      <mesh position={[0, 0.48, -0.16]} castShadow><boxGeometry args={[0.38, 0.42, 0.08]} /><meshStandardMaterial color="#966b48" roughness={0.82} /></mesh>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => <mesh key={`${x}-${z}`} position={[x * 0.13, 0.12, z * 0.13]}><boxGeometry args={[0.055, 0.24, 0.055]} /><meshStandardMaterial color="#684d38" /></mesh>))}
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
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (mode === "orbit") return undefined;
    const eyeHeight = mode === "pov" ? 1.65 : 3;
    camera.position.set(0, eyeHeight, 7);
    camera.lookAt(0, mode === "pov" ? eyeHeight : 2, 0);
    const onKeyDown = (event) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(event.code)) {
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
  }, [mode, camera]);
  useFrame((_, delta) => {
    if (mode === "orbit" || !locked) return;
    const keysDown = keys.current;
    const forwardAmount = Number(keysDown.has("KeyW") || keysDown.has("ArrowUp")) - Number(keysDown.has("KeyS") || keysDown.has("ArrowDown"));
    const sideAmount = Number(keysDown.has("KeyD") || keysDown.has("ArrowRight")) - Number(keysDown.has("KeyA") || keysDown.has("ArrowLeft"));
    const verticalAmount = Number(keysDown.has("Space")) - Number(keysDown.has("ShiftLeft") || keysDown.has("ShiftRight"));
    if (!forwardAmount && !sideAmount && !(mode === "creative" && verticalAmount)) return;
    camera.getWorldDirection(forward);
    if (mode === "pov") forward.y = 0;
    forward.normalize();
    if (mode === "pov") right.crossVectors(forward, camera.up).normalize();
    else right.set(-forward.z, 0, forward.x).normalize();
    const sprint = mode === "creative" && (keysDown.has("ControlLeft") || keysDown.has("ControlRight"));
    const speed = (sprint ? 9 : mode === "creative" ? 5.5 : 4) * Math.min(delta, 0.05);
    camera.position.addScaledVector(forward, forwardAmount * speed);
    camera.position.addScaledVector(right, sideAmount * speed);
    if (mode === "creative") {
      camera.position.y = Math.max(0.25, Math.min(24, camera.position.y + verticalAmount * speed));
    } else {
      camera.position.x = Math.max(-9.5, Math.min(9.5, camera.position.x));
      camera.position.z = Math.max(-7.5, Math.min(7.5, camera.position.z));
      camera.position.y = 1.65;
    }
  });
  return null;
}

function FloorCanvas({
  objects = [],
  availability = [],
  selectedId,
  onSelect,
  selectLayoutObjects = false,
  reservationMode = false,
}) {
  const controlsRef = useRef(null);
  const [navigationMode, setNavigationMode] = useState("orbit");
  const [mouseLocked, setMouseLocked] = useState(false);
  const byId = new Map(availability.map((item) => [item.id, item]));
  return (
    <div className="floor-scene">
      <div className="scene-toolbar">
        <div><strong>3D floor preview</strong><span>{navigationMode === "creative" ? (mouseLocked ? "WASD move · mouse look · Space up · Shift down · Ctrl sprint · Esc exit" : "Click the scene · WASD move · Space up · Shift down · Ctrl sprint · Esc exit") : navigationMode === "pov" ? (mouseLocked ? "WASD walk · mouse look · Esc exit" : "Click the scene · WASD walk · mouse look · Esc exit") : "Drag to orbit · scroll to zoom · right-drag to pan"}</span></div>
        <div className="scene-toolbar-actions">
          {navigationMode === "orbit" ? <>
            <button type="button" onClick={() => setNavigationMode("creative")} title="Free-fly with keyboard and mouse; Space rises and Shift descends">Creative fly</button>
            <button type="button" onClick={() => setNavigationMode("pov")} title="Walk at eye level through the restaurant">POV immersive</button>
            <button type="button" onClick={() => controlsRef.current?.reset()} title="Reset camera">Reset view</button>
          </> : <button type="button" className="is-active" onClick={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            setMouseLocked(false);
            setNavigationMode("orbit");
          }} title="Exit keyboard and mouse navigation">Exit {navigationMode === "creative" ? "creative" : "POV"}</button>}
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
        onCreated={({ gl }) => { gl.domElement.id = "dineflow-walk-canvas"; }}
      >
        <color attach="background" args={["#f2f3ee"]} />
        <hemisphereLight args={["#fffaf0", "#777366", 0.7]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 11, 7]} intensity={2} castShadow />
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
            selected={Array.isArray(selectedId)
              ? selectedId.some((id) => String(id) === String(selectLayoutObjects ? (object.id ?? object._key) : object.table_id))
              : selectedId === (selectLayoutObjects ? (object.id ?? object._key) : object.table_id)}
            selectionId={selectLayoutObjects ? (object.id ?? object._key) : object.table_id}
            selectable={selectLayoutObjects || (object.object_type === "table" && Boolean(byId.get(object.table_id)?.available))}
            onSelect={onSelect}
            reservationMode={reservationMode}
          />
        ))}
        {navigationMode !== "orbit" ? <>
          <PointerLockControls
            selector="#dineflow-walk-canvas"
            makeDefault
            onLock={() => setMouseLocked(true)}
            onUnlock={() => { setMouseLocked(false); setNavigationMode("orbit"); }}
          />
          <WalkNavigation mode={navigationMode} locked={mouseLocked} />
        </> : <OrbitControls
            ref={controlsRef}
            makeDefault
            target={[0, 0, 0]}
            minPolarAngle={0.45}
            maxPolarAngle={1.42}
            minDistance={7}
            maxDistance={28}
            enableDamping
          />}
      </Canvas>
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
    </div>
  );
}
