import { useEffect, useRef, useState } from 'react';
import TileForgeMapViewport, { TileThumbnail, MapField } from './TileForgeMapViewport.jsx';
import {
  FORGE_ASSET_CHOICES, TILE_MAP_LIMITS, createTileMap, createMapHistory, commitMapHistory, undoMapHistory, redoMapHistory,
  forgeMapAsset, compileMapAsset, addMapAssets, addCandidateToMap, stampMapAsset, moveMapInstance, eraseMapInstance,
  updateMapLayer, addMapLayer, reorderMapLayer, validateTileMap, pickMapInstance, projectMapPoint, unprojectMapPoint, mapStrokePoints,
  serializeTileMap, deserializeTileMap, downloadMapFile,
} from '../../../lib/pixelbrain/tileForgeMap.adapter.js';
import './TileForgeMapEditor.css';

const TOOLS = [['paint', 'Brush', 'B'], ['select', 'Select / move', 'V'], ['erase', 'Erase', 'E'], ['pan', 'Pan', 'H']];
const INITIAL_SOURCE = `SCDL 2
ASSET custom_tile
CANVAS WIDTH 80 HEIGHT 40
SHAPE $left (TRIANGLE P1 (VEC2 (PX 0) (PX 20)) P2 (VEC2 (PX 40) (PX 0)) P3 (VEC2 (PX 40) (PX 40)))
SHAPE $right (TRIANGLE P1 (VEC2 (PX 40) (PX 0)) P2 (VEC2 (PX 80) (PX 20)) P3 (VEC2 (PX 40) (PX 40)))
LAYER terrain ORDER 10 BLEND REPLACE {
  PAINT $left FILL #3C6415 RASTER CENTER
  PAINT $right FILL #5B8C1D RASTER CENTER
}
`;

export default function TileForgeMapEditor({ candidate, biome, shaderMode, glowIntensity, atmosphereWarmth }) {
  const [history, setHistory] = useState(() => createMapHistory(createTileMap()));
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(history.present);
  const [tool, setTool] = useState('paint');
  const [activeAssetId, setActiveAssetId] = useState(null);
  const [activeLayerId, setActiveLayer] = useState('terrain');
  const [instancePage, setInstancePage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [hover, setHover] = useState({ x: 0, y: 0, z: 0 });
  const [elevation, setElevation] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [filter, setFilter] = useState('');
  const [forgeType, setForgeType] = useState('ground');
  const [forgeSeed, setForgeSeed] = useState(4242);
  const [message, setMessage] = useState('Forge a tile, or forge a chunk above to fill your palette.');
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [sourceName, setSourceName] = useState('Custom tile');
  const [sourceKind, setSourceKind] = useState('terrain');
  const [sourceAnchor, setSourceAnchor] = useState({ x: 40, y: 20 });
  const [sourceFootprint, setSourceFootprint] = useState({ gridW: 1, gridH: 1 });
  const [size, setSize] = useState({ width: 24, height: 24 });
  const stroke = useRef(null);
  const lastCandidate = useRef(null);
  const mapFile = useRef(null);
  const sourceFile = useRef(null);
  const sourcePanel = useRef(null);
  const map = draft || history.present;
  const activeLayer = map.layers.some(l => l.id === activeLayerId) ? activeLayerId : map.layers[0].id;
  const layerInstances = map.instances.filter(i => i.layerId === activeLayer);
  const page = Math.min(instancePage, Math.max(0, Math.ceil(layerInstances.length / 100) - 1));
  const brush = map.assets.find(a => a.id === activeAssetId) || null;
  const selected = map.instances.find(i => i.id === selectedId);
  const inspected = map.assets.find(a => a.id === selected?.assetId) || brush;
  const dirty = map !== saved;

  useEffect(() => {
    if (!candidate || candidate === lastCandidate.current) return;
    lastCandidate.current = candidate;
    try {
      const next = addCandidateToMap(history.present, candidate);
      setHistory(h => commitMapHistory(h, next));
      setMessage('Chunk tiles added to the palette. Select any tile and place it on your map.');
    } catch (error) { setMessage(error.message); }
  }, [candidate, history.present]);

  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const commit = (operation, success) => {
    try {
      const next = operation(history.present);
      setHistory(h => commitMapHistory(h, next));
      if (success) setMessage(success);
      return next;
    } catch (error) { setMessage(error.message); return null; }
  };
  const chooseAsset = asset => { setActiveAssetId(asset.id); setSelectedId(null); setTool('paint'); setMessage(`${asset.name} selected. Click a cell to place; drag to paint.`); };
  const addAsset = asset => {
    const next = commit(current => addMapAssets(current, [asset]), 'Asset added. Its pixels and source are preserved with the map.');
    if (next) chooseAsset(asset);
  };
  const forge = () => {
    try { addAsset(forgeMapAsset({ type: forgeType, biome, seed: forgeSeed })); } catch (error) { setMessage(error.message); }
  };
  const compile = () => {
    try { addAsset(compileMapAsset({ source, name: sourceName, kind: sourceKind, anchor: sourceAnchor, footprint: sourceFootprint, biome })); }
    catch (error) { setMessage(error.message); }
  };
  const editSource = () => {
    if (!inspected) return;
    setSource(inspected.scdlSource); setSourceName(`${inspected.name.slice(0, 100)} variant`); setSourceKind(inspected.kind);
    setSourceAnchor(inspected.anchor); setSourceFootprint(inspected.footprint);
    sourcePanel.current.open = true;
    sourcePanel.current.scrollIntoView({ block: 'nearest' });
    setMessage('Edit the SCDL and compile a new tile when ready. Existing placements keep their current asset.');
  };
  const finish = () => {
    if (!stroke.current) return;
    const completed = stroke.current;
    stroke.current = null; setDraft(null);
    setHistory(h => commitMapHistory(h, completed.current));
  };
  const cancel = () => { stroke.current = null; setDraft(null); setMessage('Stroke cancelled.'); };
  const applyStroke = (world, first = false) => {
    const gesture = stroke.current;
    if (!gesture) return;
    try {
      if (gesture.tool === 'select') {
        if (!gesture.selected) return;
        const cell = unprojectMapPoint(gesture.current, world, gesture.selected.z);
        const dx = cell.x - gesture.start.x; const dy = cell.y - gesture.start.y;
        gesture.current = moveMapInstance(gesture.current, gesture.selected.id, { x: gesture.selected.x + dx, y: gesture.selected.y + dy });
      } else {
        const cell = unprojectMapPoint(gesture.current, world, elevation);
        const points = first ? [cell] : mapStrokePoints(gesture.last, cell);
        for (const point of points) {
          if (gesture.tool === 'paint') gesture.current = stampMapAsset(gesture.current, { assetId: activeAssetId, layerId: activeLayer, ...point });
          else {
            const hit = pickMapInstance(gesture.current, first ? world : projectMapPoint(gesture.current, point), activeLayer);
            if (hit) gesture.current = eraseMapInstance(gesture.current, hit.id);
          }
        }
        gesture.last = cell;
      }
      setDraft(gesture.current);
    } catch (error) { setMessage(error.message); setDraft(gesture.current); }
  };
  const start = world => {
    const cell = unprojectMapPoint(map, world, elevation);
    setHover(cell);
    const hit = tool === 'select' ? pickMapInstance(map, world, activeLayer) : null;
    if (tool === 'select') setSelectedId(hit?.id || null);
    stroke.current = { current: map, tool, last: cell, selected: hit, start: hit ? unprojectMapPoint(map, world, hit.z) : cell };
    applyStroke(world, true);
  };
  const move = world => { setHover(unprojectMapPoint(map, world, elevation)); applyStroke(world); };
  const undo = () => { cancel(); setHistory(undoMapHistory); setMessage('Undo.'); };
  const redo = () => { cancel(); setHistory(redoMapHistory); setMessage('Redo.'); };
  const keyDown = e => {
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
      e.preventDefault(); if (e.shiftKey || e.key.toLowerCase() === 'y') redo(); else undo(); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    const shortcut = TOOLS.find(t => t[2].toLowerCase() === e.key.toLowerCase());
    if (shortcut) { setTool(shortcut[0]); return; }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (directions[e.key]) {
      e.preventDefault(); const [dx, dy] = directions[e.key];
      if (tool === 'select' && selected) commit(current => moveMapInstance(current, selected.id, { x: selected.x + dx, y: selected.y + dy }));
      else setHover(h => ({ x: Math.max(0, Math.min(map.width - 1, (h?.x ?? 0) + dx)), y: Math.max(0, Math.min(map.height - 1, (h?.y ?? 0) + dy)), z: elevation }));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); if (hover) { start(projectMapPoint(map, { ...hover, z: elevation })); finish(); }
    } else if (e.key === 'Delete' && selected) {
      e.preventDefault(); commit(current => eraseMapInstance(current, selected.id));
    }
  };
  const save = () => {
    try { downloadMapFile(serializeTileMap(map), map.name); setSaved(map); setMessage('Map downloaded with all tile pixels, SCDL, bytecode, and SCD128 records.'); }
    catch (error) { setMessage(error.message); }
  };
  const load = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      if (file.size > TILE_MAP_LIMITS.fileBytes) throw new Error('Map exceeds the 32 MB file limit.');
      const next = deserializeTileMap(await file.text());
      finish(); setHistory(h => commitMapHistory(h, next)); setSaved(next); setSize({ width: next.width, height: next.height });
      setSelectedId(null); setActiveAssetId(next.assets[0]?.id || null); setActiveLayer(next.layers[0].id);
      setMessage('Map loaded. Undo restores your previous map.');
    } catch (error) { setMessage(error.message); }
  };
  const loadSource = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error('SCDL file exceeds 64 KB.');
      setSource(await file.text()); setSourceName(file.name.replace(/\.scdl$/i, '')); setMessage('Source loaded for review. Compile & add when ready.');
    } catch (error) { setMessage(error.message); }
  };

  return <section className="tf-map-editor" aria-label="Tile Forge map studio">
    <div className="tf-map-toolbar">
      <div className="tf-map-toolgroup" role="group" aria-label="Map tools">{TOOLS.map(([id, title, key]) => <button type="button" key={id} aria-pressed={tool === id} onClick={() => { finish(); setTool(id); }} title={`${title} (${key})`}>{title} <kbd>{key}</kbd></button>)}</div>
      <button type="button" disabled={!history.past.length} onClick={undo}>Undo</button>
      <button type="button" disabled={!history.future.length} onClick={redo}>Redo</button>
      <MapField>Elevation <input aria-label="Brush elevation" type="number" min={-16} max={32} value={elevation} onChange={e => { const z = Math.max(-16, Math.min(32, Number(e.target.value))); setElevation(z); setHover(h => h && ({ ...h, z })); }} /></MapField>
      <MapField><input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} /> Grid</MapField>
      <span className="tf-map-spacer" />
      <button type="button" onClick={() => mapFile.current.click()}>Open map</button>
      <button type="button" className="tf-map-primary" onClick={save}>Save map{dirty ? ' *' : ''}</button>
      <input ref={mapFile} type="file" accept=".json" hidden onChange={load} aria-label="Open Tile Forge map file" />
    </div>
    <div className="tf-map-workspace">
      <aside className="tf-map-palette" aria-label="Tile palette">
        <div className="tf-map-panelheading"><h2>Tile palette</h2><span>{map.assets.length} assets</span></div>
        <MapField>Asset type<select value={forgeType} onChange={e => setForgeType(e.target.value)}>{FORGE_ASSET_CHOICES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></MapField>
        <p>{FORGE_ASSET_CHOICES.find(c => c.id === forgeType)?.family === 'asset' ? 'Art palette: Scholomance Sunlit Glade. Water and cliff generators retain their native material palettes.' : `Biome: ${biome.replaceAll('_', ' ')}`}</p>
        <div className="tf-map-row"><MapField>Seed<input type="number" min={0} max={4294967295} value={forgeSeed} onChange={e => setForgeSeed(Number(e.target.value))} /></MapField><button type="button" onClick={forge}>Forge tile</button></div>
        <MapField className="tf-map-search">Find tile<input type="search" placeholder="Search your palette" value={filter} onChange={e => setFilter(e.target.value)} /></MapField>
        <div className="tf-map-assets">
          {map.assets.filter(a => a.name.toLowerCase().includes(filter.toLowerCase())).map(a => <button type="button" key={a.id} className="tf-map-asset" aria-pressed={a.id === activeAssetId} onClick={() => chooseAsset(a)} title={`${a.name} · ${a.width}×${a.height} pixels · ${a.footprint.gridW}×${a.footprint.gridH} cells`}><TileThumbnail asset={a} /><span>{a.name}</span><small>{a.width} × {a.height}</small></button>)}
          {!map.assets.length && <p className="tf-map-empty">Your tiles collect here. Forge individual assets or a complete chunk, then paint them anywhere on the grid.</p>}
        </div>
        <details ref={sourcePanel} className="tf-map-source"><summary>SCDL V2 · custom tile</summary>
          <MapField>Tile name<input value={sourceName} maxLength={120} onChange={e => setSourceName(e.target.value)} /></MapField>
          <MapField>Placement kind<select value={sourceKind} onChange={e => setSourceKind(e.target.value)}><option value="terrain">Terrain</option><option value="prop">Prop / actor</option></select></MapField>
          <div className="tf-map-row">{['x', 'y'].map(axis => <MapField key={axis}>Anchor {axis.toUpperCase()}<input type="number" min={0} max={512} value={sourceAnchor[axis]} onChange={e => setSourceAnchor(a => ({ ...a, [axis]: Number(e.target.value) }))} /></MapField>)}</div>
          <div className="tf-map-row">{[['gridW', 'Footprint W'], ['gridH', 'Footprint H']].map(([key, title]) => <MapField key={key}>{title}<input type="number" min={1} max={32} value={sourceFootprint[key]} onChange={e => setSourceFootprint(f => ({ ...f, [key]: Number(e.target.value) }))} /></MapField>)}</div>
          <MapField>SCDL source<textarea spellCheck={false} value={source} onChange={e => setSource(e.target.value)} rows={12} maxLength={65536} /></MapField>
          <p>Anchor coordinates are native pixels. Compilation runs the AMPs explicitly declared in your source.</p>
          <div className="tf-map-row"><button type="button" onClick={() => sourceFile.current.click()}>Open .scdl</button><button type="button" className="tf-map-primary" onClick={compile}>Compile &amp; add</button></div>
          <input ref={sourceFile} type="file" accept=".scdl,.txt" hidden onChange={loadSource} aria-label="Open SCDL source file" />
        </details>
      </aside>
      <div className="tf-map-center">
        <TileForgeMapViewport map={map} tool={tool} brush={brush} selectedId={selectedId} hover={hover} elevation={elevation} showGrid={showGrid} shaderMode={shaderMode} glowIntensity={glowIntensity} atmosphereWarmth={atmosphereWarmth} onStart={start} onMove={move} onEnd={finish} onCancel={cancel} onKeyDown={keyDown} />
        <div className="tf-map-status" role="status" aria-live="polite">{message}</div>
        <div className="tf-map-readout"><span>{map.width} × {map.height} cells · {map.instances.length} placements</span><span>{hover ? `Cell ${hover.x}, ${hover.y} · Z ${elevation}` : 'Choose a tile'} · 80 × 40 dimetric</span></div>
      </div>
      <aside className="tf-map-inspector" aria-label="Map layers and tile inspector">
        <div className="tf-map-panelheading"><h2>Layers</h2><button type="button" onClick={() => { const next = commit(addMapLayer); if (next) setActiveLayer(next.layers.at(-1).id); }}>+ Layer</button></div>
        <p className="tf-map-hint">Top row draws last. Selection and erasing use the active layer.</p>
        <div className="tf-map-layers">{[...map.layers].reverse().map(l => <div key={l.id} className={`tf-map-layer ${activeLayer === l.id ? 'is-active' : ''}`}>
          <button type="button" aria-pressed={activeLayer === l.id} onClick={() => { setActiveLayer(l.id); setSelectedId(null); }}>{l.name}</button>
          <MapField title="Visible"><input type="checkbox" aria-label={`Show ${l.name}`} checked={l.visible} onChange={e => commit(m => updateMapLayer(m, l.id, { visible: e.target.checked }))} />Show</MapField>
          <MapField title="Locked"><input type="checkbox" aria-label={`Lock ${l.name}`} checked={l.locked} onChange={e => commit(m => updateMapLayer(m, l.id, { locked: e.target.checked }))} />Lock</MapField>
          <button type="button" aria-label={`Raise ${l.name}`} onClick={() => commit(m => reorderMapLayer(m, l.id, 1))}>↑</button>
          <button type="button" aria-label={`Lower ${l.name}`} onClick={() => commit(m => reorderMapLayer(m, l.id, -1))}>↓</button>
        </div>)}</div>
        <MapField>Layer name<input key={activeLayer + map.layers.find(l => l.id === activeLayer)?.name} defaultValue={map.layers.find(l => l.id === activeLayer)?.name || ''} maxLength={120} onBlur={e => { if (e.target.value !== map.layers.find(l => l.id === activeLayer)?.name) commit(m => updateMapLayer(m, activeLayer, { name: e.target.value })); }} /></MapField>
        <details open className="tf-map-inspection"><summary>{selected ? 'Placed tile' : 'Asset inspector'}</summary>
          {inspected ? <>
            <strong>{inspected.name}</strong><p>{inspected.width} × {inspected.height} native pixels · {inspected.footprint.gridW} × {inspected.footprint.gridH} footprint</p>
            {selected && <>
              <div className="tf-map-row">{['x', 'y', 'z'].map(axis => <MapField key={axis}>{axis.toUpperCase()}<input type="number" aria-label={`Selected tile ${axis}`} value={selected[axis]} onChange={e => commit(m => moveMapInstance(m, selected.id, { [axis]: Number(e.target.value) }))} /></MapField>)}</div>
              <div className="tf-map-row"><button type="button" onClick={() => { setActiveAssetId(selected.assetId); setTool('paint'); setMessage('Duplicate armed. Click a destination cell.'); }}>Duplicate</button><button type="button" onClick={() => commit(m => eraseMapInstance(m, selected.id), 'Tile removed. Undo restores it.')}>Delete tile</button></div>
            </>}
            <button type="button" disabled={!inspected.scdlSource} onClick={editSource}>Edit SCDL as new variant</button>
            <details><summary>SCD128 identity</summary><p>FORM64</p><code>{inspected.scd128Record.scd128Wire.slice(0, 64)}</code><p>REALIZATION64</p><code>{inspected.scd128Record.scd128Wire.slice(64)}</code></details>
            <details><summary>AMP descriptors ({inspected.ampDescriptors.length})</summary><pre>{JSON.stringify(inspected.ampDescriptors, null, 2)}</pre></details>
          </> : <p>Select a palette asset or a placed tile to inspect its source and identity.</p>}
        </details>
        <details><summary>Placed tiles ({layerInstances.length})</summary><div className="tf-map-instance-list">{layerInstances.slice(page * 100, (page + 1) * 100).map(i => <button type="button" key={i.id} aria-pressed={selectedId === i.id} onClick={() => { setSelectedId(i.id); setTool('select'); }}>{map.assets.find(a => a.id === i.assetId)?.name} · {i.x},{i.y},{i.z}</button>)}</div>
          <div className="tf-map-row"><button type="button" disabled={page === 0} onClick={() => setInstancePage(page - 1)}>Previous</button><span>{page + 1} / {Math.max(1, Math.ceil(layerInstances.length / 100))}</span><button type="button" disabled={(page + 1) * 100 >= layerInstances.length} onClick={() => setInstancePage(page + 1)}>Next</button></div>
        </details>
        <details className="tf-map-settings"><summary>Map settings</summary>
          <MapField>Map name<input key={map.name} defaultValue={map.name} maxLength={120} onBlur={e => { if (e.target.value !== map.name) commit(m => validateTileMap({ ...m, name: e.target.value })); }} /></MapField>
          <div className="tf-map-row">{['width', 'height'].map(axis => <MapField key={axis}>{axis}<input type="number" min={1} max={256} value={size[axis]} onChange={e => setSize(s => ({ ...s, [axis]: Number(e.target.value) }))} /></MapField>)}</div>
          <button type="button" onClick={() => commit(m => validateTileMap({ ...m, ...size }), 'Map resized. All placements retained.')}>Resize map</button>
          <button type="button" disabled={!candidate} onClick={() => { const next = commit(m => addCandidateToMap(m, candidate, true), 'Chunk placed as individually editable tiles. Map expanded to fit; Undo restores the previous arrangement.'); if (next) setSize({ width: next.width, height: next.height }); }}>Place generated chunk</button>
          <p>Chunk placement expands the map to fit and replaces matching cells on cliffs, terrain, details, and props layers.</p>
          <button type="button" onClick={() => { const next = commit(m => addMapAssets(createTileMap({ ...size, name: 'Untitled map' }), m.assets), 'New blank map. Palette retained; Undo restores the previous map.'); if (next) { setActiveLayer('terrain'); setSelectedId(null); } }}>New blank map</button>
        </details>
      </aside>
    </div>
  </section>;
}
