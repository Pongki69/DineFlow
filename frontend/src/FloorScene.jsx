import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Component, useEffect, useMemo } from "react";
import { CanvasTexture } from "three";

function SceneLabel({
  text,
  position,
  color = "#294436",
  scale = [2.4, 0.5, 1],
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    context.font = "bold 36px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 384, 64, 740);
    return new CanvasTexture(canvas);
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial map={texture} depthTest={false} />
    </sprite>
  );
}

const STATUS_COLORS = {
  available: "#57a46b",
  reserved: "#d7a43b",
  occupied: "#c65c57",
  cleaning: "#77909a",
  unavailable: "#777d7b",
  selected: "#3966d8",
};

function SceneObject({ object, status, selected, onSelect, nextSlot }) {
  const p = object.position || { x: 0, z: 0 };
  const d = object.dimensions || { width: 1.5, depth: 1.3, height: 0.8 };
  const color = selected
    ? STATUS_COLORS.selected
    : STATUS_COLORS[status] || "#a78d6c";
  if (object.object_type === "wall")
    return (
      <mesh position={[p.x || 0, 0.55, p.z || 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[d.width || 4, d.height || 1.1, d.depth || 0.18]} />
        <meshStandardMaterial color="#d8d1c3" />
      </mesh>
    );
  if (object.object_type === "entrance")
    return (
      <group position={[p.x || 0, 0.03, p.z || 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[d.width || 2.2, d.depth || 0.4]} />
          <meshStandardMaterial color="#8ab6a0" />
        </mesh>
        <SceneLabel text="ENTRANCE" position={[0, 0.15, 0]} />
      </group>
    );
  if (object.object_type !== "table")
    return (
      <group position={[p.x || 0, 0.25, p.z || 0]}>
        <mesh>
          <boxGeometry args={[d.width || 1.6, d.height || 0.5, d.depth || 1]} />
          <meshStandardMaterial
            color={object.object_type === "counter" ? "#907359" : "#b6a58d"}
          />
        </mesh>
        <SceneLabel
          text={object.label || object.object_type}
          position={[0, (d.height || 0.5) / 2 + 0.15, 0]}
        />
      </group>
    );
  const capacity = object.table?.capacity || object.properties?.capacity || 2;
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
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(object.table_id);
      }}
    >
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.12, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.42, 12]} />
        <meshStandardMaterial color="#765b43" />
      </mesh>
      {Array.from({ length: Math.min(capacity, 8) }, (_, i) => {
        const angle = (2 * Math.PI * i) / Math.min(capacity, 8);
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 0.82, 0.22, Math.sin(angle) * 0.82]}
          >
            <boxGeometry args={[0.34, 0.42, 0.34]} />
            <meshStandardMaterial color="#b68f68" />
          </mesh>
        );
      })}
      <SceneLabel
        text={
          object.table?.table_number || object.label || `T${object.table_id}`
        }
        position={[0, 0.65, 0]}
        scale={[1.2, 0.3, 1]}
      />
      <SceneLabel
        text={`${selected ? "Selected" : status}${estimate ? ` · est. ${estimate}` : ""}${nextSlotLabel ? ` · next ${nextSlotLabel}` : ""}`}
        color={color}
        position={[0, 1.1, 0]}
      />
      {seatedAt && (
        <SceneLabel text={`Seated since ${seatedAt}`} position={[0, 1.5, 0]} />
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

function FloorCanvas({
  objects = [],
  availability = [],
  selectedId,
  onSelect,
}) {
  const byId = new Map(availability.map((item) => [item.id, item]));
  return (
    <div className="floor-scene">
      <Canvas
        fallback={
          <p>
            3D is unavailable. Use the Accessible 2D view to choose a table.
          </p>
        }
        camera={{ position: [9, 12, 11], fov: 38 }}
        shadows
      >
        <color attach="background" args={["#eef0ea"]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 10, 6]} intensity={2} castShadow />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.08, 0]}
          receiveShadow
        >
          <planeGeometry args={[24, 20]} />
          <meshStandardMaterial color="#d7d2c7" />
        </mesh>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={`x${i}`} position={[-10 + i * 2, 0, -9]}>
            <boxGeometry args={[0.035, 0.02, 18]} />
            <meshStandardMaterial color="#c5c2b9" />
          </mesh>
        ))}
        {objects.map((object) => (
          <SceneObject
            key={object.id || `${object.object_type}-${object.label}`}
            object={object}
            status={
              byId.get(object.table_id)?.status ||
              object.table?.operational_status ||
              "available"
            }
            estimateMinutes={
              byId.get(object.table_id)?.estimated_remaining_minutes
            }
            nextSlot={byId.get(object.table_id)?.next_schedulable_slot}
            selected={selectedId === object.table_id}
            onSelect={(id) => {
              if (byId.get(id)?.available) onSelect?.(id);
            }}
          />
        ))}
        <OrbitControls
          target={[0, 0, 0]}
          minPolarAngle={0.45}
          maxPolarAngle={1.42}
          enableDamping
        />
      </Canvas>
      <div className="floor-legend">
        {Object.entries(STATUS_COLORS)
          .filter(([key]) => key !== "selected")
          .map(([status, color]) => (
            <span key={status}>
              <i style={{ background: color }} />
              {status}
            </span>
          ))}
      </div>
    </div>
  );
}
