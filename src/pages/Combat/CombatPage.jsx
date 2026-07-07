import { useEffect, useMemo, useRef, useState } from 'react';
import './CombatPage.css';

const WORLD_URL = '/data/pixelbrain/voidmetal-cave.world.json';
const PLAYER_MODEL_URL = '/data/pixelbrain/void-scholar-voxel.packet.json';
const VOID_SCHOLAR_IMAGE_URL = '/assets/void-scholar.svg';

const CHUNK_SIZE = 12;
const ACTIVE_CHUNK_RADIUS = 1;
const TILE_SIZE = 8;
const PLAYER_SPEED = 5.2;
const TURN_SPEED = 2.35;
const FOV = Math.PI / 3;
const RAY_DISTANCE = 24;

const MODEL_FACE_COLORS = {
  top: { 1: '#171021', 2: '#241a3f', 3: '#f6b863', 4: '#d9fbff', 5: '#c98f45' },
  left: { 1: '#0d0914', 2: '#151024', 3: '#d49f55', 4: '#75e6ff', 5: '#9f6a31' },
  right: { 1: '#030206', 2: '#05030a', 3: '#6f431d', 4: '#11b5d8', 5: '#553017' },
};

const MATERIAL_RENDER_COLORS = {
  1: [18, 15, 29],
  2: [39, 32, 51],
  3: [123, 108, 255],
  4: [110, 231, 255],
  5: [36, 199, 223],
};

function projectVoxel(x, y, z, tileSize = TILE_SIZE) {
  return {
    x: (x - z) * tileSize,
    y: (x + z) * (tileSize / 2) - y * tileSize,
  };
}

function playerWorldToScreen(player, offset) {
  const p = projectVoxel(player.x, player.y, player.z, TILE_SIZE);
  return { x: p.x + offset.x, y: p.y + offset.y };
}

function facePoints(face, offset) {
  const points = face.polygon || [];
  return points.map((point) => `${point.x + offset.x},${point.y + offset.y}`).join(' ');
}

function renderTextureMark(face, mark, offset, index) {
  if (mark.type === 'dot') {
    return (
      <circle
        key={`${face.id}:texture:${index}`}
        cx={mark.x + offset.x}
        cy={mark.y + offset.y}
        r={mark.r}
        fill={mark.fill}
        className="void-cave-texture-mark"
      />
    );
  }
  return (
    <line
      key={`${face.id}:texture:${index}`}
      x1={mark.x1 + offset.x}
      y1={mark.y1 + offset.y}
      x2={mark.x2 + offset.x}
      y2={mark.y2 + offset.y}
      stroke={mark.stroke}
      strokeWidth={mark.width}
      strokeLinecap="square"
      className="void-cave-texture-mark"
    />
  );
}

function chunkKeyFor(x, z) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
}

function angleForFacing(facing = 'east') {
  if (facing === 'north') return -Math.PI / 2;
  if (facing === 'south') return Math.PI / 2;
  if (facing === 'west') return Math.PI;
  return 0;
}

function normalizeAngle(angle) {
  let next = angle;
  while (next <= -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
}

function facingForAngle(angle) {
  const normalized = normalizeAngle(angle);
  const abs = Math.abs(normalized);
  if (abs > Math.PI * 0.75) return 'west';
  if (abs < Math.PI * 0.25) return 'east';
  return normalized > 0 ? 'south' : 'north';
}

function hash2(x, z) {
  let h = 2166136261;
  h ^= Math.floor(x) + 374761393; h = Math.imul(h, 16777619);
  h ^= Math.floor(z) + 668265263; h = Math.imul(h, 16777619);
  return (h >>> 0) / 4294967295;
}

function rgb([r, g, b], shade = 1) {
  return `rgb(${Math.max(0, Math.min(255, Math.round(r * shade)))}, ${Math.max(0, Math.min(255, Math.round(g * shade)))}, ${Math.max(0, Math.min(255, Math.round(b * shade)))})`;
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function modelFacePoints(face, scale = 1.2) {
  const hw = scale;
  const hh = scale / 2;
  const fh = scale;
  const { sx, sy, type } = face;
  if (type === 'top') return [[sx, sy], [sx + hw, sy + hh], [sx, sy + 2 * hh], [sx - hw, sy + hh]];
  if (type === 'left') return [[sx - hw, sy + hh], [sx, sy + 2 * hh], [sx, sy + 2 * hh + fh], [sx - hw, sy + hh + fh]];
  return [[sx, sy + 2 * hh], [sx + hw, sy + hh], [sx + hw, sy + hh + fh], [sx, sy + 2 * hh + fh]];
}

function buildModelFaces(model) {
  if (!model?.voxels?.length) return [];
  const occupied = new Set(model.voxels.map((v) => `${v.x},${v.y},${v.z}`));
  const faces = [];

  for (const voxel of model.voxels) {
    const materialId = voxel.materialId;
    const checks = [
      ['top', 0, 1, 0],
      ['left', 0, 0, 1],
      ['right', 1, 0, 0],
    ];
    for (const [type, dx, dy, dz] of checks) {
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      const projected = projectVoxel(voxel.x, voxel.y, voxel.z, 1.2);
      faces.push({
        type,
        materialId,
        sx: projected.x,
        sy: projected.y,
        sortKey: (voxel.z + voxel.y) * 10000 + voxel.x * 10 + (type === 'top' ? 0 : type === 'left' ? 1 : 2),
      });
    }
  }

  return faces.sort((a, b) => a.sortKey - b.sortKey);
}

function makeWorldRuntime(artifact) {
  const walkableSet = new Set((artifact.gameplay?.walkable || []).map((cell) => `${cell.x},${cell.z}`));
  const mineableByCoord = new Map((artifact.gameplay?.mineables || []).map((node) => [`${node.voxel.x},${node.voxel.y},${node.voxel.z}`, node]));
  const mineableIdByCoord = new Map((artifact.gameplay?.mineables || []).map((node) => [`${node.voxel.x},${node.voxel.y},${node.voxel.z}`, node.id]));
  const columnMaterials = new Map();
  const faceChunks = new Map();

  for (const solid of artifact.gameplay?.collisionSolids || []) {
    if (solid.y < 2 || solid.y > 6) continue;
    const key = `${solid.x},${solid.z}`;
    if (!columnMaterials.has(key) || solid.materialId === 3 || solid.materialId === 4 || solid.materialId === 5) {
      columnMaterials.set(key, solid.materialId);
    }
  }

  for (const face of artifact.faces || []) {
    const key = chunkKeyFor(face.voxel.x, face.voxel.z);
    if (!faceChunks.has(key)) faceChunks.set(key, []);
    faceChunks.get(key).push(face);
  }

  return { walkableSet, mineableByCoord, mineableIdByCoord, columnMaterials, faceChunks };
}

function raycast(runtime, player, angle, dimensions) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let previousX = Math.floor(player.x);
  let previousZ = Math.floor(player.z);

  for (let distance = 0.08; distance <= RAY_DISTANCE; distance += 0.045) {
    const wx = player.x + dx * distance;
    const wz = player.z + dz * distance;
    const cellX = Math.floor(wx);
    const cellZ = Math.floor(wz);
    if (cellX < 0 || cellZ < 0 || cellX >= dimensions.width || cellZ >= dimensions.depth) {
      return { distance, materialId: 1, side: 'boundary', texture: hash2(cellX, cellZ) };
    }
    if (!runtime.walkableSet.has(`${cellX},${cellZ}`)) {
      const crossedX = cellX !== previousX;
      return {
        distance,
        materialId: runtime.columnMaterials.get(`${cellX},${cellZ}`) || 1,
        side: crossedX ? 'x' : 'z',
        texture: hash2(cellX * 17 + Math.floor(wx * 4), cellZ * 23 + Math.floor(wz * 4)),
      };
    }
    previousX = cellX;
    previousZ = cellZ;
  }

  return { distance: RAY_DISTANCE, materialId: 1, side: 'void', texture: 0.4 };
}

function drawFirstPersonWorld(canvas, runtime, artifact, player) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width * dpr));
  const height = Math.max(240, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  const horizon = Math.round(height * 0.48);
  const ceiling = ctx.createLinearGradient(0, 0, 0, horizon);
  ceiling.addColorStop(0, '#03040b');
  ceiling.addColorStop(1, '#0a0713');
  ctx.fillStyle = ceiling;
  ctx.fillRect(0, 0, width, horizon);

  const floor = ctx.createLinearGradient(0, horizon, 0, height);
  floor.addColorStop(0, '#090713');
  floor.addColorStop(1, '#02030a');
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, width, height - horizon);

  const columnWidth = Math.max(2, Math.ceil(width / 360));
  for (let sx = 0; sx < width; sx += columnWidth) {
    const cameraX = (sx / width) - 0.5;
    const rayAngle = player.angle + cameraX * FOV;
    const hit = raycast(runtime, player, rayAngle, artifact.dimensions);
    const correctedDistance = Math.max(0.1, hit.distance * Math.cos(rayAngle - player.angle));
    const wallHeight = Math.min(height * 1.6, Math.round((height * 0.92) / correctedDistance));
    const y = Math.round(horizon - wallHeight * 0.5);
    const base = MATERIAL_RENDER_COLORS[hit.materialId] || MATERIAL_RENDER_COLORS[1];
    const depthShade = Math.max(0.22, 1 - correctedDistance / RAY_DISTANCE);
    const sideShade = hit.side === 'x' ? 0.82 : 1;
    const grain = 0.84 + hit.texture * 0.28;
    ctx.fillStyle = rgb(base, depthShade * sideShade * grain);
    ctx.fillRect(sx, y, columnWidth + 1, wallHeight);

    if (hit.materialId === 3 || hit.materialId === 4 || hit.materialId === 5) {
      ctx.fillStyle = hit.materialId === 3 ? 'rgba(139, 124, 255, 0.32)' : 'rgba(110, 231, 255, 0.38)';
      ctx.fillRect(sx, y, columnWidth + 1, wallHeight);
    }

    if (sx % (columnWidth * 5) === 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.018 + hit.texture * 0.026})`;
      ctx.fillRect(sx, y + wallHeight * 0.18, 1, wallHeight * 0.58);
    }
  }

  ctx.fillStyle = 'rgba(110, 231, 255, 0.72)';
  ctx.fillRect(width / 2 - 7 * dpr, horizon - 1 * dpr, 14 * dpr, 2 * dpr);
  ctx.fillRect(width / 2 - 1 * dpr, horizon - 7 * dpr, 2 * dpr, 14 * dpr);
}

function computeRenderOffset(faces) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const face of faces) {
    for (const point of face.polygon || []) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX)) return { x: 640, y: 280, width: 1280, height: 720 };
  return {
    x: -minX + 96,
    y: -minY + 96,
    width: maxX - minX + 192,
    height: maxY - minY + 192,
  };
}

function nearestMineable(player, mineables, minedIds) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of mineables) {
    if (minedIds.has(node.id)) continue;
    const d = distance2d(player, { x: node.voxel.x, z: node.voxel.z });
    if (d < bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return bestDistance <= 2.2 ? { node: best, distance: bestDistance } : null;
}

function WorldMinimap({ artifact, player, minedIds }) {
  const size = 168;
  const pad = 10;
  const width = artifact.dimensions?.width || 48;
  const depth = artifact.dimensions?.depth || 48;
  const sx = (size - pad * 2) / width;
  const sy = (size - pad * 2) / depth;
  const mineables = artifact.gameplay?.mineables || [];

  return (
    <aside className="void-cave-minimap" aria-label="Voidmetal cave minimap">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Cave minimap">
        <rect width={size} height={size} rx="8" className="void-cave-minimap__backdrop" />
        {(artifact.gameplay?.walkable || []).map((cell) => (
          <rect
            key={`${cell.x}:${cell.z}`}
            x={pad + cell.x * sx}
            y={pad + cell.z * sy}
            width={Math.max(1, sx)}
            height={Math.max(1, sy)}
            fill="#211a33"
          />
        ))}
        {mineables.map((node) => (
          <circle
            key={node.id}
            cx={pad + (node.voxel.x + 0.5) * sx}
            cy={pad + (node.voxel.z + 0.5) * sy}
            r={minedIds.has(node.id) ? 1.2 : 2.4}
            fill={minedIds.has(node.id) ? '#3f3a52' : '#8b7cff'}
          />
        ))}
        <circle
          cx={pad + player.x * sx}
          cy={pad + player.z * sy}
          r="4.6"
          fill="#6ee7ff"
          stroke="#f8fbff"
          strokeWidth="1.4"
        />
      </svg>
    </aside>
  );
}

function VoidScholarAvatar({ faces }) {
  const [useScratchArt, setUseScratchArt] = useState(true);

  if (useScratchArt) {
    return (
      <img
        className="void-cave-scholar-avatar void-cave-scholar-avatar--art"
        src={VOID_SCHOLAR_IMAGE_URL}
        alt="VOID Scholar"
        draggable="false"
        onError={() => setUseScratchArt(false)}
      />
    );
  }

  return (
    <svg className="void-cave-scholar-avatar" viewBox="-34 -70 82 92" aria-label="Void Scholar model">
      <g transform="translate(4 -8) scale(1.35)">
        {faces.map((face, index) => (
          <polygon
            key={`${face.sortKey}-${index}`}
            points={modelFacePoints(face).map(([x, y]) => `${x},${y}`).join(' ')}
            fill={MODEL_FACE_COLORS[face.type]?.[face.materialId] || '#67e8f9'}
          />
        ))}
      </g>
    </svg>
  );
}

export default function CombatPage() {
  const [artifact, setArtifact] = useState(null);
  const [playerModel, setPlayerModel] = useState(null);
  const [player, setPlayer] = useState({ x: 5, y: 2, z: 8, facing: 'east', angle: 0 });
  const [cameraMode, setCameraMode] = useState('first');
  const [inventory, setInventory] = useState({ voidmetal: 0 });
  const [minedIds, setMinedIds] = useState(() => new Set());
  const [notice, setNotice] = useState('Loading PixelBrain world...');
  const canvasRef = useRef(null);
  const keysRef = useRef(new Set());
  const frameRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(WORLD_URL).then((response) => response.json()),
      fetch(PLAYER_MODEL_URL).then((response) => response.json()),
    ]).then(([world, model]) => {
      if (cancelled) return;
      setArtifact(world);
      setPlayerModel(model);
      const spawn = world.playerSpawn || { x: 5, y: 2, z: 8, facing: 'east' };
      setPlayer({ ...spawn, angle: angleForFacing(spawn.facing) });
      setNotice(`Seed ${world.seed?.value || 'VOIDMETAL-CAVE-20260617'} initialized.`);
    }).catch((error) => {
      if (!cancelled) setNotice(`WORLD LOAD FAULT - ${error.message}`);
    });
    return () => { cancelled = true; };
  }, []);

  const runtime = useMemo(() => artifact ? makeWorldRuntime(artifact) : null, [artifact]);
  const modelFaces = useMemo(() => buildModelFaces(playerModel), [playerModel]);
  const activeFaces = useMemo(() => {
    if (!artifact || !runtime) return [];
    const cx = Math.floor(player.x / CHUNK_SIZE);
    const cz = Math.floor(player.z / CHUNK_SIZE);
    const faces = [];
    for (let dz = -ACTIVE_CHUNK_RADIUS; dz <= ACTIVE_CHUNK_RADIUS; dz += 1) {
      for (let dx = -ACTIVE_CHUNK_RADIUS; dx <= ACTIVE_CHUNK_RADIUS; dx += 1) {
        faces.push(...(runtime.faceChunks.get(`${cx + dx},${cz + dz}`) || []));
      }
    }
    return faces.sort((a, b) => a.sortKey - b.sortKey);
  }, [artifact, player.x, player.z, runtime]);
  const offset = useMemo(() => computeRenderOffset(activeFaces), [activeFaces]);
  const mineable = useMemo(() => (
    artifact ? nearestMineable(player, artifact.gameplay?.mineables || [], minedIds) : null
  ), [artifact, minedIds, player]);

  useEffect(() => {
    const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowleft', 'arrowright']);
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (event.altKey && key === 'c') {
        event.preventDefault();
        setCameraMode((mode) => {
          const next = mode === 'first' ? 'third' : 'first';
          setNotice(next === 'third' ? 'Third-person gear view active.' : 'First-person cave view active.');
          return next;
        });
        return;
      }
      if (movementKeys.has(key)) {
        event.preventDefault();
        keysRef.current.add(key);
      }
      if (key === 'e') {
        event.preventDefault();
        setMinedIds((current) => {
          if (!mineable?.node || current.has(mineable.node.id)) return current;
          const next = new Set(current);
          next.add(mineable.node.id);
          setInventory((inv) => ({ ...inv, voidmetal: (inv.voidmetal || 0) + mineable.node.yield }));
          setNotice(`Mined ${mineable.node.yield} voidmetal from ${mineable.node.id}.`);
          return next;
        });
      }
    };
    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      if (movementKeys.has(key)) {
        event.preventDefault();
        keysRef.current.delete(key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [mineable]);

  useEffect(() => {
    if (!runtime) return undefined;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const keys = keysRef.current;
      const turn = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
      const forward = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
      const strafe = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      if (turn !== 0 || forward !== 0 || strafe !== 0) {
        setPlayer((current) => {
          const angle = normalizeAngle((current.angle ?? angleForFacing(current.facing)) + turn * TURN_SPEED * dt);
          const forwardX = Math.cos(angle);
          const forwardZ = Math.sin(angle);
          const strafeX = Math.cos(angle + Math.PI / 2);
          const strafeZ = Math.sin(angle + Math.PI / 2);
          const len = Math.hypot(forward, strafe) || 1;
          const nx = current.x + ((forwardX * forward + strafeX * strafe) / len) * PLAYER_SPEED * dt;
          const nz = current.z + ((forwardZ * forward + strafeZ * strafe) / len) * PLAYER_SPEED * dt;
          const canMove = runtime.walkableSet.has(`${Math.floor(nx)},${Math.floor(nz)}`);
          return {
            ...current,
            angle,
            x: canMove ? nx : current.x,
            z: canMove ? nz : current.z,
            facing: facingForAngle(angle),
          };
        });
      }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [runtime]);

  useEffect(() => {
    if (!artifact || !runtime || !canvasRef.current) return undefined;
    let animationFrame = 0;
    const draw = () => {
      if (canvasRef.current) drawFirstPersonWorld(canvasRef.current, runtime, artifact, player);
    };
    const requestDraw = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(draw);
    };
    requestDraw();
    window.addEventListener('resize', requestDraw);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', requestDraw);
    };
  }, [artifact, cameraMode, player, runtime]);

  if (!artifact || !runtime) {
    return <div className="battle-page-loading">{notice}</div>;
  }

  const loadedChunkCount = new Set(activeFaces.map((face) => chunkKeyFor(face.voxel.x, face.voxel.z))).size;
  const cameraLabel = cameraMode === 'third' ? 'Third Person' : 'First Person';

  return (
    <main className={`void-cave-page void-cave-page--${cameraMode}`} aria-label="PixelBrain voidmetal cave world">
      <section className="void-cave-world" aria-label="Generated voxel cave">
        <canvas ref={canvasRef} className="void-cave-canvas" aria-label="First-person generated voidmetal cave" />
        {cameraMode === 'third' && (
          <div className="void-cave-third-person" aria-label="Third-person Void Scholar gear view">
            <VoidScholarAvatar faces={modelFaces} />
          </div>
        )}
        <div className="void-cave-camera-chip">{cameraLabel} · Alt+C</div>
      </section>

      <section className="void-cave-hud" aria-label="World status">
        <div className="void-cave-panel void-cave-panel--hero">
          <span>PixelBrain World</span>
          <strong>Voidmetal Cave</strong>
          <small>WASD move · arrows turn · Alt+C camera · E mine</small>
        </div>
        <div className="void-cave-panel">
          <span>Seed</span>
          <strong>{artifact.seed?.value || 'VOIDMETAL-CAVE-20260617'}</strong>
        </div>
        <div className="void-cave-panel">
          <span>Chunks</span>
          <strong>{loadedChunkCount}</strong>
          <small>{CHUNK_SIZE}x{CHUNK_SIZE} grid</small>
        </div>
        <div className="void-cave-panel">
          <span>Voidmetal</span>
          <strong>{inventory.voidmetal}</strong>
          <small>{mineable?.node ? 'E to mine nearby vein' : 'No vein in reach'}</small>
        </div>
        <div className="void-cave-panel void-cave-panel--notice" aria-live="polite">
          {notice}
        </div>
      </section>

      <WorldMinimap artifact={artifact} player={player} minedIds={minedIds} />
    </main>
  );
}
