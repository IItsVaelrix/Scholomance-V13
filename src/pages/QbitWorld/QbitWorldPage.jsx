// IMMUNE_ALLOW: LING-0F03
import { useMemo, useState } from 'react';
import { Download, Hammer, Layers, RotateCcw } from 'lucide-react';

import {
  buildQbitWorldGameLoop,
  harvestFaceResource,
  QBIT_WORLD_PRESETS,
  MATERIAL_NAMES,
} from '../../../codex/core/pixelbrain/qbit-world-game-loop.js';
import './QbitWorldPage.css';

const MATERIAL_COLORS = {
  top:   { 1: '#6b7280', 2: '#9ca3af', 3: '#d1d5db', 4: '#bae6fd' },
  left:  { 1: '#374151', 2: '#4b5563', 3: '#6b7280', 4: '#7dd3fc' },
  right: { 1: '#1f2937', 2: '#374151', 3: '#4b5563', 4: '#38bdf8' },
};

const PRESET_LABELS = Object.freeze({
  VOID: 'Void',
  ALCHEMY: 'Alchemy',
  SONIC: 'Sonic',
  PSYCHIC: 'Psychic',
  WILL: 'Will',
});

function facePoints(face, tileSize, ox, oy) {
  const { type, sx, sy } = face;
  const hw = tileSize;
  const hh = tileSize / 2;
  const fh = tileSize;
  let points = [];

  if (type === 'top') {
    points = [[sx, sy], [sx + hw, sy + hh], [sx, sy + 2 * hh], [sx - hw, sy + hh]];
  } else if (type === 'left') {
    points = [[sx - hw, sy + hh], [sx, sy + 2 * hh], [sx, sy + 2 * hh + fh], [sx - hw, sy + hh + fh]];
  } else if (type === 'right') {
    points = [[sx, sy + 2 * hh], [sx + hw, sy + hh], [sx + hw, sy + hh + fh], [sx, sy + 2 * hh + fh]];
  }

  return points.map(([px, py]) => `${px + ox},${py + oy}`).join(' ');
}

function computeViewBox(faces, tileSize, padding) {
  if (faces.length === 0) return { width: 1, height: 1, ox: 0, oy: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const face of faces) {
    const raw = facePoints(face, tileSize, 0, 0)
      .split(' ')
      .map((pair) => pair.split(',').map(Number));
    for (const [px, py] of raw) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }

  return {
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    ox: -minX + padding,
    oy: -minY + padding,
  };
}

function mergeInventory(inventory, resource) {
  const key = `${resource.materialName}:${resource.energyType}:${resource.schoolId}`;
  const next = { ...inventory };
  const existing = next[key] ?? {
    key,
    materialName: resource.materialName,
    energyType: resource.energyType,
    schoolId: resource.schoolId,
    amount: 0,
    harvests: 0,
  };
  next[key] = {
    ...existing,
    amount: existing.amount + resource.amount,
    harvests: existing.harvests + 1,
  };
  return next;
}

function MaterialHistogram({ histogram }) {
  const entries = Object.entries(histogram)
    .filter(([materialId]) => Number(materialId) > 0)
    .sort(([a], [b]) => Number(a) - Number(b));

  return (
    <div className="qbit-meter-stack" aria-label="Material distribution">
      {entries.map(([materialId, count]) => (
        <div className="qbit-meter" key={materialId}>
          <span>{MATERIAL_NAMES[materialId] ?? `material-${materialId}`}</span>
          <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}

export default function QbitWorldPage() {
  const [presetId, setPresetId] = useState('QBIT');
  const [selectedFaceId, setSelectedFaceId] = useState(null);
  const [inventory, setInventory] = useState({});
  const [notice, setNotice] = useState('');

  const world = useMemo(
    () => buildQbitWorldGameLoop(QBIT_WORLD_PRESETS[presetId], { size: 32, maxRadius: 24 }),
    [presetId]
  );
  const viewBox = useMemo(() => computeViewBox(world.faces, 16, 44), [world.faces]);
  const selectedFace = world.faces.find((face) => face.id === selectedFaceId) ?? world.faces[0] ?? null;
  const inventoryEntries = Object.values(inventory).sort((a, b) => a.key.localeCompare(b.key));

  function choosePreset(nextPresetId) {
    setPresetId(nextPresetId);
    setSelectedFaceId(null);
    setInventory({});
    setNotice('');
  }

  function harvestSelected() {
    if (!selectedFace) return;
    const resource = harvestFaceResource(selectedFace);
    setInventory((current) => mergeInventory(current, resource));
    setNotice(`${resource.amount} ${resource.energyType.toLowerCase()} ${resource.materialName}`);
  }



  return (
    <section className={`qbit-world-page qbit-world-page--${presetId.toLowerCase()}`}>
      <header className="qbit-world-header">
        <div>
          <p className="qbit-world-kicker">QBIT Level 5</p>
          <h1>World Loop</h1>
        </div>
        <div className="qbit-world-presets" aria-label="School signature">
          {Object.keys(QBIT_WORLD_PRESETS).map((id) => (
            <button
              key={id}
              type="button"
              className={id === presetId ? 'qbit-preset qbit-preset--active' : 'qbit-preset'}
              onClick={() => choosePreset(id)}
              aria-pressed={id === presetId}
            >
              {PRESET_LABELS[id] ?? id}
            </button>
          ))}

        </div>
      </header>

      <div className="qbit-world-shell">
        <main className="qbit-world-stage" aria-label={`${presetId} generated voxel world`}>
          <svg
            className="qbit-world-svg"
            viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
            role="img"
            aria-label={`${presetId} QBIT voxel field`}
          >
            <rect width={viewBox.width} height={viewBox.height} className="qbit-world-backdrop" />
            {world.faces.map((face) => {
              const active = selectedFace?.id === face.id;
              const fill = MATERIAL_COLORS[face.type]?.[face.materialId] ?? '#64748b';
              return (
                <polygon
                  key={face.id}
                  className={active ? 'qbit-face qbit-face--selected' : 'qbit-face'}
                  points={facePoints(face, 16, viewBox.ox, viewBox.oy)}
                  fill={fill}
                  tabIndex={0}
                  role="button"
                  aria-label={`${face.resource.materialName} ${face.resource.energyType} voxel at ${face.x}, ${face.y}, ${face.z}`}
                  onClick={() => setSelectedFaceId(face.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedFaceId(face.id);
                    }
                  }}
                />
              );
            })}
          </svg>
        </main>

        <aside className="qbit-world-console" aria-label="World telemetry">
          <section className="qbit-console-section">
            <div className="qbit-console-title">
              <Layers size={16} aria-hidden="true" />
              <h2>{world.params.dominantSchoolId}</h2>
            </div>
            <div className="qbit-stat-grid">
              <div>
                <span>Faces</span>
                <strong>{world.telemetry.faceCount}</strong>
              </div>
              <div>
                <span>Solid</span>
                <strong>{world.telemetry.solidCount}</strong>
              </div>
              <div>
                <span>Density</span>
                <strong>{Math.round(world.telemetry.density * 100)}%</strong>
              </div>
              <div>
                <span>Emission</span>
                <strong>{world.params.emission.toFixed(2)}</strong>
              </div>
            </div>
          </section>

          <section className="qbit-console-section">
            <h2>Selected Face</h2>
            {selectedFace && (
              <dl className="qbit-face-readout">
                <div><dt>Material</dt><dd>{selectedFace.resource.materialName}</dd></div>
                <div><dt>Energy</dt><dd>{selectedFace.resource.energyType}</dd></div>
                <div><dt>Yield</dt><dd>{selectedFace.resource.amount}</dd></div>
                <div><dt>XYZ</dt><dd>{selectedFace.x}, {selectedFace.y}, {selectedFace.z}</dd></div>
              </dl>
            )}
            <div className="qbit-action-row">
              <button className="qbit-command qbit-command--primary" type="button" onClick={harvestSelected}>
                <Hammer size={16} aria-hidden="true" />
                Harvest
              </button>
              <button className="qbit-command" type="button" onClick={() => setInventory({})}>
                <RotateCcw size={16} aria-hidden="true" />
                Clear
              </button>
            </div>
            <p className="qbit-live" aria-live="polite">{notice}</p>
          </section>

          <section className="qbit-console-section">
            <h2>Inventory</h2>
            {inventoryEntries.length === 0 ? (
              <p className="qbit-empty">No resources</p>
            ) : (
              <ul className="qbit-inventory">
                {inventoryEntries.map((item) => (
                  <li key={item.key}>
                    <span>{item.materialName} / {item.energyType}</span>
                    <strong>{item.amount}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="qbit-console-section">
            <h2>Assembly</h2>
            <div className="qbit-assembly-stack" aria-label="Asset assembly chain">
              <div className="qbit-assembly-row">
                <span>PixelBrain</span>
                <strong>{world.pixelBrainAsset.contract}</strong>
              </div>
              <div className="qbit-assembly-row">
                <span>Wand</span>
                <strong>{world.wandProposal.proposedFormula.formula.type}</strong>
              </div>
              <div className="qbit-assembly-row">
                <span>DivWand</span>
                <strong>{world.divWandNode.type}/{world.divWandNode.role}</strong>
              </div>
            </div>
          </section>

          <section className="qbit-console-section">
            <h2>Materials</h2>
            <MaterialHistogram histogram={world.telemetry.materialHistogram} />
          </section>
        </aside>
      </div>
    </section>
  );
}
