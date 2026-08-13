/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic props are not DOM attributes. */
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const DEFAULT_PALETTE = Object.freeze({
  void: '#05060f',
  amethyst: '#8b7cff',
  arc: '#cfe6ff',
  gold: '#e8c96a',
});

function readScenePalette(element) {
  const stage = element?.closest('.constellation-stage');
  if (!stage || typeof window === 'undefined') return DEFAULT_PALETTE;
  const styles = window.getComputedStyle(stage);
  const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    void: token('--cos-void', DEFAULT_PALETTE.void),
    amethyst: token('--cos-amethyst', DEFAULT_PALETTE.amethyst),
    arc: token('--cos-arc', DEFAULT_PALETTE.arc),
    gold: token('--cos-gold', DEFAULT_PALETTE.gold),
  };
}

/**
 * Probes WebGL support and NAMES why it is unavailable.
 *
 * A bare `catch { return false }` reports "no WebGL" identically whether the
 * browser has none, the driver is blocklisted, or context creation threw — so a
 * failure that should be reported is indistinguishable from a plain absence.
 * The returned fallback carries the caught error and a reason instead.
 *
 * @returns {{ ok: boolean, error: Error | null, reason: string }}
 */
function probeWebGL() {
  if (typeof document === 'undefined') {
    return { ok: false, error: null, reason: 'no document — rendered outside a browser' };
  }
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!context) {
      return { ok: false, error: null, reason: 'this browser returned no webgl2 or webgl context' };
    }
    return { ok: true, error: null, reason: 'webgl context acquired' };
  } catch (error) {
    return { ok: false, error, reason: `webgl context creation threw: ${error?.message ?? String(error)}` };
  }
}

function BackgroundStars({ color }) {
  const positions = useMemo(() => {
    const values = new Float32Array(180 * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < 180; index += 1) {
      const radius = 9 + (index % 11) * 0.48;
      const angle = index * golden;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = Math.sin(angle) * radius * 0.62;
      values[index * 3 + 2] = -2 - (index % 13) * 0.7;
    }
    return values;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.035} transparent opacity={0.56} sizeAttenuation />
    </points>
  );
}

function Connection({ from, to, color, active }) {
  const positions = useMemo(
    () => new Float32Array([...from, ...to]),
    [from, to],
  );
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={active ? 0.72 : 0.2} />
    </line>
  );
}

function StarNode({ node, palette, active, selected, onSelect, onHover }) {
  const color = palette[node.tone] ?? palette.arc;
  const scale = node.magnitude * (selected ? 1.28 : active ? 1.1 : 0.86);

  return (
    <group position={node.position} scale={scale}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(node);
        }}
        onPointerOut={() => onHover(null)}
      >
        {node.kind === 'lodestar' ? <icosahedronGeometry args={[0.35, 1]} /> : null}
        {node.kind === 'channel' ? <octahedronGeometry args={[0.27, 0]} /> : null}
        {node.kind === 'satellite' ? <sphereGeometry args={[0.16, 16, 16]} /> : null}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.6 : active ? 0.9 : 0.38}
          roughness={0.42}
          metalness={0.12}
        />
      </mesh>
      {(selected || node.kind === 'lodestar') ? (
        <mesh scale={node.kind === 'lodestar' ? 1.85 : 1.65} raycast={() => null}>
          <sphereGeometry args={[0.28, 16, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={selected ? 0.12 : 0.08}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function SpatialField({ model, palette, selectedNodeId, selectedChannel, reducedMotion, onSelect, onHover }) {
  const fieldRef = useRef(null);
  const nodeById = useMemo(
    () => new Map(model.nodes.map((node) => [node.id, node])),
    [model.nodes],
  );

  useFrame(({ clock }) => {
    if (!fieldRef.current) return;
    if (reducedMotion) {
      fieldRef.current.rotation.set(0, 0, 0);
      return;
    }
    const time = clock.elapsedTime;
    fieldRef.current.rotation.y = Math.sin(time * 0.12) * 0.055;
    fieldRef.current.rotation.x = Math.cos(time * 0.09) * 0.022;
  });

  return (
    <group ref={fieldRef}>
      {model.edges.map((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return null;
        return (
          <Connection
            key={edge.id}
            from={from.position}
            to={to.position}
            color={palette[edge.channelId === 'identity' ? 'gold' : 'amethyst']}
            active={edge.channelId === selectedChannel}
          />
        );
      })}
      {model.nodes.map((node) => (
        <StarNode
          key={node.id}
          node={node}
          palette={palette}
          active={node.channelId === selectedChannel}
          selected={node.id === selectedNodeId}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}

function WebGLFallback({ model, onSelect, selectedNodeId, reason }) {
  const primaryNodes = model.nodes.filter((node) => node.kind !== 'satellite');
  return (
    <div className="constellation-viewport__fallback" role="status" data-webgl-reason={reason}>
      <span className="constellation-viewport__fallback-mark" aria-hidden="true">✦</span>
      <p>Spatial rendering is unavailable. The complete celestial index remains accessible.</p>
      {/*
        The reason is RENDERED, not only stamped on the element. An attribute a
        screen reader never announces and a user cannot see is a diagnostic for
        whoever already knows to open devtools — which is never the person the
        fallback is for. It sits inside the same role="status" region, so it is
        announced with the message it explains.
      */}
      {reason ? (
        <p className="constellation-viewport__fallback-reason">Reason: {reason}</p>
      ) : null}
      <div className="constellation-viewport__fallback-actions">
        {primaryNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className="constellation-viewport__index-button"
            aria-pressed={node.id === selectedNodeId}
            onClick={() => onSelect(node)}
          >
            {node.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ConstellationViewport3D({
  model,
  selectedNode,
  selectedChannel,
  reducedMotion,
  onSelectNode,
}) {
  const rootRef = useRef(null);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [webgl, setWebgl] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  useEffect(() => {
    setPalette(readScenePalette(rootRef.current));
    setWebgl(probeWebGL());
  }, []);

  const focusNode = hoveredNode ?? selectedNode ?? model.nodes[0];
  const primaryNodes = model.nodes.filter((node) => node.kind !== 'satellite');

  return (
    <section
      ref={rootRef}
      className="constellation-viewport"
      aria-labelledby="constellation-spatial-title"
    >
      <header className="constellation-viewport__header">
        <div>
          <p className="constellation-experience__eyebrow">Spatial index</p>
          <h2 id="constellation-spatial-title">Living syntax field</h2>
        </div>
        <p className="constellation-viewport__coordinates" aria-live="polite">
          {focusNode.label}
        </p>
      </header>

      <div
        className="constellation-viewport__canvas"
        role="group"
        aria-label={`${model.nodes.length} semantic stars arranged around the submitted query`}
      >
        {webgl?.ok ? (
          <Canvas
            aria-hidden="true"
            camera={{ position: [0, 0, 13.5], fov: 46, near: 0.1, far: 60 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            <fog attach="fog" args={[palette.void, 13, 28]} />
            <ambientLight intensity={0.34} />
            <pointLight position={[0, 1, 7]} color={palette.gold} intensity={22} distance={18} />
            <pointLight position={[-6, 4, 2]} color={palette.amethyst} intensity={14} distance={18} />
            <BackgroundStars color={palette.arc} />
            <SpatialField
              model={model}
              palette={palette}
              selectedNodeId={selectedNode?.id}
              selectedChannel={selectedChannel}
              reducedMotion={reducedMotion}
              onSelect={onSelectNode}
              onHover={setHoveredNode}
            />
          </Canvas>
        ) : webgl ? (
          <WebGLFallback
            model={model}
            onSelect={onSelectNode}
            selectedNodeId={selectedNode?.id}
            reason={webgl.reason}
          />
        ) : (
          <div className="constellation-viewport__charting" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {webgl?.ok ? (
        <nav className="constellation-viewport__node-index" aria-label="Spatial field focus points">
          {primaryNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className="constellation-viewport__index-button"
              aria-pressed={node.id === selectedNode?.id}
              onFocus={() => setHoveredNode(node)}
              onBlur={() => setHoveredNode(null)}
              onClick={() => onSelectNode(node)}
            >
              {node.label}
            </button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
