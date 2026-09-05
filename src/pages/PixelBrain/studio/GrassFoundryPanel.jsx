import { useEffect, useMemo, useRef, useState } from 'react';

import {
  generateStudioGrass,
  getStudioGrassDefaults,
  getStudioGrassPalettes,
} from '../../../lib/pixelbrain.adapter.js';

const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const TILE_SIZES = [16, 24, 32, 48, 64];
const LIBRARY_KEY = 'pixelbrain.sward.library.v1';

function resultLayer(result, layer) {
  return layer === 'ground' ? result.ground : layer === 'blades' ? result.blades : result.field;
}

function drawResult(canvas, result, { repeat = 1, layer = 'final' } = {}) {
  if (!canvas || !result) return;
  const { width, height, palette } = result;
  const field = resultLayer(result, layer);
  canvas.width = width * repeat;
  canvas.height = height * repeat;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let tileY = 0; tileY < repeat; tileY += 1) {
    for (let tileX = 0; tileX < repeat; tileX += 1) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const rank = field[y * width + x];
          if (rank < 0) continue;
          context.fillStyle = palette[rank] || '#000000';
          context.fillRect(tileX * width + x, tileY * height + y, 1, 1);
        }
      }
    }
  }
}

function GrassCanvas({ result, repeat = 1, layer = 'final', label, compact = false }) {
  const ref = useRef(null);
  useEffect(() => drawResult(ref.current, result, { repeat, layer }), [result, repeat, layer]);
  return (
    <canvas
      ref={ref}
      className={`pb-grass-canvas${compact ? ' is-compact' : ''}`}
      aria-label={label}
      role="img"
    />
  );
}

function readLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function GrassFoundryPanel() {
  const palettes = useMemo(() => getStudioGrassPalettes(), []);
  const [params, setParams] = useState(() => getStudioGrassDefaults());
  const [result, setResult] = useState(() => generateStudioGrass(getStudioGrassDefaults()));
  const [variants, setVariants] = useState([]);
  const [repeat, setRepeat] = useState(1);
  const [layer, setLayer] = useState('final');
  const [library, setLibrary] = useState(readLibrary);
  const [notice, setNotice] = useState('Form first · colour second · deterministic seed');

  const update = (key, value) => setParams((current) => ({ ...current, [key]: value }));

  const grow = () => {
    const palette = palettes.find((entry) => entry.id === params.paletteId) || palettes[0];
    const nextParams = { ...params, palette: palette.colors };
    const next = generateStudioGrass(nextParams);
    setParams(nextParams);
    setResult(next);
    setVariants([0, 1, 2, 3].map((offset) => generateStudioGrass({ ...nextParams, seed: (nextParams.seed + offset) >>> 0 })));
    setNotice(`Accepted seed ${next.diagnostics.seed} in ${next.diagnostics.attempts} attempt(s).`);
  };

  const saveLocal = () => {
    const entry = {
      id: `sward-${params.seed}-${result.width}x${result.height}`,
      name: `Sward ${params.seed.toString(16).toUpperCase()}`,
      params: { ...params, palette: params.palette.map((rgb) => [...rgb]) },
      field: [...result.field],
      palette: [...result.palette],
    };
    const next = [entry, ...library.filter((item) => item.id !== entry.id)].slice(0, 20);
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
      setLibrary(next);
      setNotice(`Saved ${entry.name} to the browser-local library.`);
    } catch {
      setNotice('Browser-local storage is unavailable; export the PNG to keep this field.');
    }
  };

  const exportPng = () => {
    const canvas = document.createElement('canvas');
    drawResult(canvas, result, { repeat, layer });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `sward-${params.seed}-${result.width}x${result.height}-r${repeat}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  };

  return (
    <section className="pb-grass-foundry" aria-labelledby="pb-grass-title">
      <header className="pb-studio-home-header">
        <div>
          <p className="pb-studio-kicker">SWARD generator · literal engine port</p>
          <h2 id="pb-grass-title">Grass Foundry</h2>
        </div>
        <div className="pb-studio-count">{result.width}×{result.height} · seed {params.seed}</div>
      </header>

      <div className="pb-grass-workbench">
        <aside className="pb-studio-card pb-grass-controls">
          <label className="pb-studio-field" htmlFor="pb-grass-size"><span>Tile size</span><select id="pb-grass-size" value={params.width} onChange={(event) => { const size = Number(event.target.value); setParams((p) => ({ ...p, width: size, height: size })); }}>{TILE_SIZES.map((size) => <option key={size}>{size}</option>)}</select></label>
          <label className="pb-studio-field" htmlFor="pb-grass-seed"><span>Seed</span><input id="pb-grass-seed" type="number" value={params.seed} onChange={(event) => update('seed', Number(event.target.value) >>> 0)} /></label>
          <label className="pb-studio-field" htmlFor="pb-grass-density"><span>Density · {params.density.toFixed(2)}</span><input id="pb-grass-density" type="range" min="0" max="1" step="0.01" value={params.density} onChange={(event) => update('density', Number(event.target.value))} /></label>
          <label className="pb-studio-field" htmlFor="pb-grass-soil"><span>Soil · {params.soil.toFixed(2)}</span><input id="pb-grass-soil" type="range" min="0" max="1" step="0.01" value={params.soil} onChange={(event) => update('soil', Number(event.target.value))} /></label>
          <label className="pb-studio-field" htmlFor="pb-grass-blade"><span>Blade scale · {params.bladeScale.toFixed(2)}</span><input id="pb-grass-blade" type="range" min="0" max="1" step="0.01" value={params.bladeScale} onChange={(event) => update('bladeScale', Number(event.target.value))} /></label>
          <label className="pb-studio-field" htmlFor="pb-grass-wind"><span>Wind</span><select id="pb-grass-wind" value={params.wind} onChange={(event) => update('wind', event.target.value)}>{WIND_DIRECTIONS.map((wind) => <option key={wind}>{wind}</option>)}</select></label>
          <label className="pb-studio-field" htmlFor="pb-grass-palette"><span>Biome palette</span><select id="pb-grass-palette" value={params.paletteId} onChange={(event) => update('paletteId', event.target.value)}>{palettes.map((palette) => <option key={palette.id} value={palette.id}>{palette.name} · {palette.note}</option>)}</select></label>
          <div className="pb-grass-swatches">{(palettes.find((entry) => entry.id === params.paletteId) || palettes[0]).colors.map((rgb, index) => <span key={index} style={{ background: `rgb(${rgb.join(',')})` }} title={`Rank ${index}`} />)}</div>
          <button type="button" className="pb-action-btn primary" onClick={grow}>Grow deterministic variants</button>
        </aside>

        <div className="pb-studio-card pb-grass-preview">
          <div className="pb-grass-viewbar" aria-label="Grass preview controls">
            {[1, 2, 8].map((count) => <button key={count} type="button" className={repeat === count ? 'is-active' : ''} onClick={() => setRepeat(count)}>{count === 1 ? 'Tile' : `${count}× repeat`}</button>)}
            {['final', 'ground', 'blades'].map((name) => <button key={name} type="button" className={layer === name ? 'is-active' : ''} onClick={() => setLayer(name)}>{name}</button>)}
          </div>
          <div className="pb-grass-canvas-stage"><GrassCanvas result={result} repeat={repeat} layer={layer} label={`${repeat} by ${repeat} seamless grass ${layer} preview`} /></div>
          <div className="pb-grass-variants">{variants.map((variant, index) => <button key={variant.diagnostics.seed} type="button" onClick={() => { setResult(variant); update('seed', variant.diagnostics.seed); }} aria-label={`Use variant seed ${variant.diagnostics.seed}`}><GrassCanvas compact result={variant} label={`Grass variant ${index + 1}`} /><span>{variant.diagnostics.seed}</span></button>)}</div>
        </div>

        <aside className="pb-studio-card pb-grass-inspector">
          <h3>Field diagnostics</h3>
          <dl className="pb-receipt">
            <div><dt>Accepted</dt><dd>{result.diagnostics.accepted ? 'YES' : 'BEST FIELD'}</dd></div>
            <div><dt>Attempts</dt><dd>{result.diagnostics.attempts}</dd></div>
            <div><dt>Tufts</dt><dd>{result.diagnostics.tuftCount}</dd></div>
            <div><dt>Scatter</dt><dd>{result.diagnostics.fillCount}</dd></div>
          </dl>
          <div className="pb-grass-histogram">{result.palette.map((color, rank) => <div key={color}><span style={{ height: `${Math.max(4, (result.diagnostics.fractions[rank] || 0) * 100)}%`, background: color }} /><small>{((result.diagnostics.fractions[rank] || 0) * 100).toFixed(1)}</small></div>)}</div>
          <div className="pb-studio-actions"><button type="button" className="pb-action-btn" onClick={saveLocal}>Keep local</button><button type="button" className="pb-action-btn" onClick={exportPng}>Export PNG</button></div>
          <p className="pb-studio-status" role="status" aria-live="polite">{notice}</p>
          <details><summary>Local library · {library.length}</summary>{library.map((item) => <p key={item.id}>{item.name} · {item.params.width}px</p>)}</details>
        </aside>
      </div>
    </section>
  );
}
