/**
 * TEMPLATE EDITOR - Lattice Grid editing surface
 *
 * UI SPEC:
 * - World-law connection: the lattice is spatial bytecode - this surface is
 *   where its legal grid points (rectangular, isometric, hexagonal, circular,
 *   fibonacci dialects) become paintable glyph cells. The grid the player
 *   sees is the same lattice the engine snaps, hit-tests and fills against:
 *   one authority, rendered.
 * - Data consumed: template-grid-engine via the Cell Wall adapter
 *   (pixelbrain.adapter.js). This component never imports codex/ directly.
 * - State: grid object in a ref (mutable engine model); tool/colour/zoom/
 *   grid-type/symmetry/cursor in React state.
 * - Accessibility: every control labelled; tool and symmetry toggles expose
 *   aria-pressed; the canvas is a keyboard surface (arrows move the cell
 *   cursor, Enter/Space applies the tool, Delete erases).
 * - Animation: none - static editing surface (TemplateEditor.css disables
 *   CRT effects so the lattice stays legible).
 */

import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  createTemplateGrid,
  generateGridPreview,
  getCellAtPosition,
  getCellOrigin,
  getGridMetrics,
  setCell,
  getCell,
  clearCell,
  floodFill,
  toggleSymmetryAxis,
  applySymmetry,
  exportToAseprite,
  exportToPixelPerfectAsepriteBinary,
  importFromAseprite,
  importFromPixelBrainAssetPacket,
  importAsepriteBinaryToFoundryAsset,
  templateGridToPixelBrainAssetPacket,
  GRID_TYPES,
  // New editor systems (PDR)
  createCommandStack,
  Command,
  createPaintCommand,
  createPhosphorylationCommand,
  buildKinase,
  createFillCommand,
  createReferenceLayer,
  setLayerVisible,
  setLayerLocked,
  setLayerOpacity,
  selectRect,
  clearSelection,
  getSelectionCells,
  getCellAnnotations,
  createLayer,
  applyAMPToCells,
  applyAMPToLayer,
  enhanceSquaresForRender,
  runSymmetryAmpProcessor,
  buildSquareSharpnessContrastPayload,
  // PDR SDF/Noise full editor integration (wrappers + normalizers are used; raw AMP fns are available via adapter but not needed locally here)
  sdfShapeEditorAmp,
  noiseFillEditorAmp,
  normalizePB_SDF_v1,
  normalizePB_NOISE_v1,
} from '../../../lib/pixelbrain.adapter.js';
import '../TemplateEditor.css';

const SPRITE_W = 160;
const SPRITE_H = 144;
const ZOOM_STEPS = [1, 2, 4, 8, 16, 32, 64];
const MAX_IMPORT_DIM = 1024;

const TOOLS = [
  { id: 'paint', label: 'PAINT' },
  { id: 'erase', label: 'ERASE' },
  { id: 'fill', label: 'FILL' },
];

const SYMMETRY_AXES = [
  { id: 'vertical', label: 'MIRROR_V' },
  { id: 'horizontal', label: 'MIRROR_H' },
  { id: 'diagonal', label: 'MIRROR_D' },
];

const GRID_TYPE_OPTIONS = Object.values(GRID_TYPES);

function traceHexPath(ctx, cx, cy, radius) {
  for (let i = 0; i < 6; i++) {
    // Pointy-top vertices every 60°, starting at 30° - engine orientation
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function TemplateEditorComponent({ onCommitAsset, onGridChange, initialAssetPacket = null }, ref) {
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const gridRef = useRef(null);
  const paintingRef = useRef(false);
  const commandStackRef = useRef(null);
  const importedInitialAssetRef = useRef(null);
  const commandLogRef = useRef([]); // UI-side log for scrubbable history list and "Export Deterministic Recipe" (stores description, ampId, options, meta, timestamp). Enables the full provenance without touching core stack.
  const strokeRejections = useRef(null); // dampened rejection state per stroke - reset on pointer up

  const [tool, setTool] = useState('paint');
  const [brushColor, setBrushColor] = useState('#C9A227');
  const [gridType, setGridType] = useState(GRID_TYPES.HEXAGONAL);
  const [cellSize, setCellSize] = useState(8);
  const [zoom, setZoom] = useState(4);
  const [axes, setAxes] = useState([]);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const [revision, setRevision] = useState(0);
  const [fault, setFault] = useState(null);
  const [palette, setPalette] = useState([]);

  // New editor state (Systems 2,6,7,8)
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [selection, setSelection] = useState(null);
  const [undoStackVersion, setUndoStackVersion] = useState(0); // force re-render on undo/redo
  const [pickedColorInfo, setPickedColorInfo] = useState(null);

  // Initialize command stack (System 7)
  if (!commandStackRef.current) {
    commandStackRef.current = createCommandStack();
  }

  useEffect(() => {
    if (!initialAssetPacket) return;
    const packetId = initialAssetPacket.id || initialAssetPacket.source?.id || 'initial-asset';
    if (importedInitialAssetRef.current === packetId) return;

    const result = importFromPixelBrainAssetPacket(initialAssetPacket, { layerBy: 'part' });
    if (!result.ok) {
      setFault(`IMPORT_FAULT: ${result.error || 'INVALID_INITIAL_ASSET'}`);
      return;
    }

    const grid = result.template || result;
    importedInitialAssetRef.current = packetId;
    gridRef.current = grid;

    // A new document invalidates the previous undo history (old commands
    // would otherwise mutate the orphaned grid while canUndo() reports true).
    commandStackRef.current?.clear();

    // Force all layers visible and unlocked so the complete chestplate can be viewed and edited.
    // Previously layers may have been locked or invisible, preventing pencil painting and showing only parts.
    if (grid.layers && Array.isArray(grid.layers)) {
      grid.layers.forEach((layer) => {
        layer.visible = true;
        layer.locked = false;
        if (typeof layer.opacity !== 'number' || layer.opacity < 0.1) layer.opacity = 1;
      });
    }

    // Also ensure the first layer is active for painting
    setActiveLayerIndex(0);

    setGridType(grid.gridType);
    setCellSize(grid.cellSize);
    setAxes([...(grid.symmetryAxes || [])]);
    setPalette(grid.palette || []);
    setActiveLayerIndex(0);
    setCursor({ col: 0, row: 0 });
    setFault(null);
    setRevision(r => r + 1);

    // When an asset/image is imported ("put the image in"), start at a useful magnification
    // for pixel art work instead of the low default. User can still step higher/lower.
    setZoom(8);

    // Ensure the scroll container starts at top-left so the full raster is visible (prevents "cut off" appearance).
    setTimeout(() => {
      if (canvasContainerRef.current) {
        canvasContainerRef.current.scrollLeft = 0;
        canvasContainerRef.current.scrollTop = 0;
      }
    }, 0);
  }, [initialAssetPacket]);

  // (Re)build the lattice when its dialect changes. Skipped when the ref was
  // already replaced with a matching grid (import path).
  useEffect(() => {
    const current = gridRef.current;
    if (current && importedInitialAssetRef.current) {
      return;
    }
    if (current && current.gridType === gridType && current.cellSize === cellSize) {
      return;
    }
    gridRef.current = createTemplateGrid({
      width: SPRITE_W,
      height: SPRITE_H,
      cellSize,
      gridType,
      snapStrength: 1,
    });
    setPalette(gridRef.current.palette || []);
    setAxes([]);
    setCursor({ col: 0, row: 0 });
    setRevision(r => r + 1);
  }, [gridType, cellSize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = grid.width * zoom;
    canvas.height = grid.height * zoom;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const metrics = getGridMetrics(grid);

    // Lattice preview (grid lines) drawn FIRST so that painted cells completely cover them.
    // This way a solid black (or any color) square fills the entire cell area without yellow lines showing through.
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)';
    ctx.lineWidth = 1;
    generateGridPreview(grid).forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x1 * zoom, line.y1 * zoom);
      ctx.lineTo(line.x2 * zoom, line.y2 * zoom);
      ctx.stroke();
    });

    // Render layers (System 2) - respect visible + basic opacity for preview
    // Cells drawn AFTER grid so colors solidly fill their squares (covering the yellow grid lines inside).
    if (grid.layers && grid.layers.length > 0) {
      grid.layers.forEach((layer, li) => {
        if (!layer.visible) return;
        const alpha = Math.max(0.1, layer.opacity || 1);
        ctx.globalAlpha = alpha;

        layer.cells.forEach(cell => {
          ctx.fillStyle = cell.color;
          const sx = cell.x * zoom;
          const sy = cell.y * zoom;

          if (metrics.hexRadius) {
            ctx.beginPath();
            traceHexPath(ctx, sx, sy, metrics.hexRadius * zoom);
            ctx.fill();
          } else {
            ctx.fillRect(sx, sy, metrics.cellSize * zoom, metrics.cellSize * zoom);
          }
        });
      });
      ctx.globalAlpha = 1.0;
    } else {
      // Legacy single layer path
      const layer = grid.layers && grid.layers[0];
      if (layer) {
        layer.cells.forEach(cell => {
          ctx.fillStyle = cell.color;
          const sx = cell.x * zoom;
          const sy = cell.y * zoom;
          if (metrics.hexRadius) {
            ctx.beginPath();
            traceHexPath(ctx, sx, sy, metrics.hexRadius * zoom);
            ctx.fill();
          } else {
            ctx.fillRect(sx, sy, metrics.cellSize * zoom, metrics.cellSize * zoom);
          }
        });
      }
    }

    // Symmetry axes
    if (grid.symmetryAxes && grid.symmetryAxes.length > 0) {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.setLineDash([6, 4]);
      grid.symmetryAxes.forEach(axis => {
        ctx.beginPath();
        if (axis === 'vertical') {
          ctx.moveTo((grid.width / 2) * zoom, 0);
          ctx.lineTo((grid.width / 2) * zoom, canvas.height);
        } else if (axis === 'horizontal') {
          ctx.moveTo(0, (grid.height / 2) * zoom);
          ctx.lineTo(canvas.width, (grid.height / 2) * zoom);
        } else {
          ctx.moveTo(0, 0);
          ctx.lineTo(canvas.width, canvas.height);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // Keyboard cursor
    const origin = getCellOrigin(grid, cursor.col, cursor.row);
    ctx.strokeStyle = '#2ddbde';
    ctx.lineWidth = 2;
    if (metrics.hexRadius) {
      ctx.beginPath();
      traceHexPath(ctx, origin.x * zoom, origin.y * zoom, metrics.hexRadius * zoom);
      ctx.stroke();
    } else {
      ctx.strokeRect(origin.x * zoom, origin.y * zoom, metrics.cellSize * zoom, metrics.cellSize * zoom);
    }
  }, [zoom, cursor]);

  useEffect(() => {
    draw();
  }, [draw, revision]);

  // Single document model: notify the page on every grid mutation so side
  // panels (layers, palette, mentor) read the same grid the canvas renders.
  useEffect(() => {
    if (typeof onGridChange === 'function' && gridRef.current) {
      onGridChange(gridRef.current, revision);
    }
  }, [onGridChange, revision]);

  // Mirror about cell centres so symmetry targets stay on-lattice for every
  // grid dialect (hex cells are already centre-addressed).
  const targetsFor = useCallback((grid, cell) => {
    let center = { x: cell.x, y: cell.y };
    if (grid.gridType !== GRID_TYPES.HEXAGONAL) {
      center = { x: cell.x + grid.cellSize / 2, y: cell.y + grid.cellSize / 2 };
    }
    const points = grid.symmetryAxes.length > 0 ? applySymmetry([center], grid) : [center];
    const seen = new Set();
    const targets = [];
    points.forEach(p => {
      const resolved = getCellAtPosition(grid, p.x, p.y);
      if (!resolved) return;
      const inBounds = resolved.col >= 0 && resolved.row >= 0
        && resolved.col < grid.cols && resolved.row < grid.rows;
      if (!inBounds) return;
      const key = `${resolved.col},${resolved.row}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push(resolved);
    });
    return targets;
  }, []);

  // --- Phosphorylation rejection dampening ---
  // Fires at most one console.warn per unique rejection reason per stroke.
  // A new reason within the same stroke resets the counter and fires again.
  // Called with onStrokeEnd() when the pointer is released.
  const notifyRejection = useCallback((reason, x, y) => {
    if (!strokeRejections.current) {
      strokeRejections.current = { reason, count: 1 };
      console.warn(`[PhosphorylationGate] Rejected at (${x},${y}): ${reason}`);
    } else if (strokeRejections.current.reason === reason) {
      strokeRejections.current.count++;
      // Same reason repeated - no additional signal (dampened)
    } else {
      strokeRejections.current = { reason, count: 1 };
      console.warn(`[PhosphorylationGate] Rejected at (${x},${y}): ${reason}`);
    }
  }, []);

  const onStrokeEnd = useCallback(() => {
    if (strokeRejections.current?.count > 0) {
      console.info(`[PhosphorylationGate] Stroke ended: ${strokeRejections.current.count} rejection(s) - ${strokeRejections.current.reason}`);
    }
    strokeRejections.current = null;
  }, []);

  const applyTool = useCallback((cell) => {
    const grid = gridRef.current;
    if (!grid) return;

    let layerIndex = activeLayerIndex;
    let layer = grid.layers && grid.layers[layerIndex] ? grid.layers[layerIndex] : grid.layers?.[0];
    if (!layer) return;

    const stack = commandStackRef.current;

    // Auto-adopt the layer that owns this pixel (if any) for paint/erase.
    // This lets you freely pencil "within the chestplate" on any existing design pixel
    // without manually switching to its exact part layer first. New pixels (outside the design)
    // still use your currently selected active layer.
    // ROBUST: use normalized col/row from the hit cell descriptor + direct .cells scan fallback
    // (same source of truth the draw() loop uses to render existing design). This guarantees
    // adopt succeeds for pre-existing chestplate part pixels even if getCell(layer, x, y) shape/key
    // differs from the descriptor returned by getCellAtPosition. Also auto-unlock the owning layer
    // on explicit interaction so "no locks" + part layers never block design edits.
    let didAutoAdopt = false;
    if ((tool === 'paint' || tool === 'erase') && grid.layers) {
      const lx = (cell && (cell.col != null ? cell.col : cell.x)) | 0;
      const ly = (cell && (cell.row != null ? cell.row : cell.y)) | 0;
      for (let i = 0; i < grid.layers.length; i++) {
        const l = grid.layers[i];
        if (!l || !l.visible) continue;
        let has = false;
        try {
          const gc = getCell(l, lx, ly);
          if (gc && gc.color) has = true;
        } catch (e) {
          // getCell may expect a grid in some paths; fallback scan below is authoritative
        }
        if (!has && l.cells) {
          // Fallback: iterate exactly like draw() does. Zero reliance on getCell keying for imported part layers.
          l.cells.forEach((cl) => {
            if (has) return;
            const cx = (cl && (cl.col != null ? cl.col : cl.x)) | 0;
            const cy = (cl && (cl.row != null ? cl.row : cl.y)) | 0;
            if (cx === lx && cy === ly && cl && cl.color) has = true;
          });
        }
        if (has) {
          layerIndex = i;
          layer = l;
          didAutoAdopt = true;
          break;
        }
      }
    }

    if (didAutoAdopt && layer && layer.locked) {
      // Explicit edit on a design pixel auto-unlocks its owning part layer (addresses "even with no locks")
      layer.locked = false;
    }
    if (layer && layer.locked) return;

    if (didAutoAdopt) {
      // Make the UI follow the layer of the pixel you just interacted with
      setActiveLayerIndex(layerIndex);
    }

    targetsFor(grid, cell).forEach(target => {
      const prevColor = getCell(layer, target.x, target.y)?.color || null;

      if (tool === 'paint') {
        // Phosphorylation path: fire when material + SDF context are available on the layer.
        // TemplateEditor is a pure template-grid editor with a brush colour - no material/SDF
        // concept exists here yet. The kinase build will return { valid: false } in that case,
        // so we fall back to the plain PaintCommand. This additive guard makes it safe to wire
        // now: when material/SDF are injected (future work), phosphorylation auto-activates.
        const activeMaterial = layer.material ?? null;
        const sdfDescriptor = layer.sdfDescriptor ?? null;
        const kinase = buildKinase(activeMaterial, sdfDescriptor);
        if (kinase.valid) {
          const outcome = stack.execute(createPhosphorylationCommand(layer, target.x, target.y, kinase, prevColor));
          if (outcome?.rejected) {
            notifyRejection(outcome.result?.reason ?? 'UNKNOWN', target.x, target.y);
            // Phosphorylation rejected - fall back to plain paint so the stroke is never lost
            stack.execute(createPaintCommand(grid, layerIndex, target.x, target.y, brushColor, prevColor));
          }
        } else {
          // No material/SDF on this layer - use plain PaintCommand (existing behaviour)
          stack.execute(createPaintCommand(grid, layerIndex, target.x, target.y, brushColor, prevColor));
        }
      } else if (tool === 'erase') {
        stack.execute(new Command({
          doFn: () => clearCell(layer, target.x, target.y),
          undoFn: () => { if (prevColor) setCell(layer, target.x, target.y, prevColor); },
          description: `Erase at (${target.x},${target.y})`,
          meta: { type: 'erase', x: target.x, y: target.y, previousColor: prevColor, layerIndex },
        }));
      } else if (tool === 'fill') {
        stack.execute(createFillCommand(grid, layer, target.x, target.y, brushColor));
      }
    });

    setCursor({ col: cell.col, row: cell.row });
    setRevision(r => r + 1);
  }, [tool, brushColor, targetsFor, activeLayerIndex, notifyRejection]);

  const cellFromEvent = useCallback((e) => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const x = ((e.clientX - rect.left) * scaleX) / zoom;
    const y = ((e.clientY - rect.top) * scaleY) / zoom;
    const cell = getCellAtPosition(grid, x, y);
    const inBounds = cell.col >= 0 && cell.row >= 0
      && cell.col < grid.cols && cell.row < grid.rows;
    return inBounds ? cell : null;
  }, [zoom]);

  const handlePointerDown = useCallback((e) => {
    setPickedColorInfo(null); // clear any previous right-click info
    if (e.button === 2) return; // right click is for color info, not painting
    paintingRef.current = true;
    const cell = cellFromEvent(e);
    if (cell) applyTool(cell);
  }, [cellFromEvent, applyTool]);

  const handlePointerMove = useCallback((e) => {
    if (!paintingRef.current || tool === 'fill') return;
    const cell = cellFromEvent(e);
    if (cell) applyTool(cell);
  }, [cellFromEvent, applyTool, tool]);

  const stopPainting = useCallback(() => {
    paintingRef.current = false;
    onStrokeEnd();
  }, [onStrokeEnd]);

  const handleKeyDown = useCallback((e) => {
    const grid = gridRef.current;
    if (!grid) return;
    const moves = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dc, dr] = moves[e.key];
      setCursor(c => ({
        col: Math.min(grid.cols - 1, Math.max(0, c.col + dc)),
        row: Math.min(grid.rows - 1, Math.max(0, c.row + dr)),
      }));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const origin = getCellOrigin(grid, cursor.col, cursor.row);
      applyTool({ col: cursor.col, row: cursor.row, x: origin.x, y: origin.y });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const layerIndex = activeLayerIndex;
      const layer = grid.layers?.[layerIndex] || grid.layers?.[0];
      if (!layer || layer.locked) return;
      const origin = getCellOrigin(grid, cursor.col, cursor.row);
      const prevColor = getCell(layer, origin.x, origin.y)?.color || null;
      commandStackRef.current?.execute(new Command({
        doFn: () => clearCell(layer, origin.x, origin.y),
        undoFn: () => { if (prevColor) setCell(layer, origin.x, origin.y, prevColor); },
        description: `Erase at (${origin.x},${origin.y})`,
        meta: { type: 'erase', x: origin.x, y: origin.y, previousColor: prevColor, layerIndex },
      }));
      setRevision(r => r + 1);
    }
  }, [cursor, applyTool, activeLayerIndex]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (!cell) return;
    const grid = gridRef.current;
    if (!grid || !grid.layers) return;

    // Find the top-most visible layer with a color at this cell position
    let color = null;
    let layerName = '';
    for (let i = grid.layers.length - 1; i >= 0; i--) {
      const layer = grid.layers[i];
      if (!layer.visible) continue;
      const c = getCell(layer, cell.x, cell.y);
      if (c && c.color) {
        color = c.color;
        layerName = layer.name || `Layer ${i}`;
        break;
      }
    }
    if (!color) {
      color = 'transparent';
      layerName = 'none';
    }

    setPickedColorInfo({
      col: cell.col,
      row: cell.row,
      x: cell.x,
      y: cell.y,
      color,
      layer: layerName,
    });

    // Auto-dismiss after a few seconds
    setTimeout(() => setPickedColorInfo(null), 4000);
  }, [cellFromEvent]);

  const handleToggleAxis = useCallback((axis) => {
    const grid = gridRef.current;
    if (!grid) return;
    toggleSymmetryAxis(grid, axis);
    setAxes([...grid.symmetryAxes]);
    setRevision(r => r + 1);
  }, []);

  const stepZoom = useCallback((dir) => {
    setZoom(z => {
      const idx = ZOOM_STEPS.indexOf(z) + dir;
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx))];
    });
  }, []);

  const handleExport = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const data = exportToAseprite(grid);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lattice_template_${grid.gridType}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportNativeAseprite = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      const binary = exportToPixelPerfectAsepriteBinary(grid, {
        id: grid.sourcePacket?.id || `${grid.gridType}-${grid.cellSize}`,
        layerName: 'Pixel Perfect Replica',
      });
      const blob = new Blob([binary], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${grid.sourcePacket?.id || 'pixelbrain_asset'}.aseprite`;
      link.click();
      URL.revokeObjectURL(url);
      setFault(null);
    } catch (err) {
      setFault(`ASEPRITE_EXPORT_FAULT: ${err.message}`);
    }
  }, []);

  const handleCommitAsset = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      const packet = templateGridToPixelBrainAssetPacket(grid, {
        sourceId: `${grid.gridType}-${grid.cellSize}`,
        label: `${grid.gridType} lattice template`,
      });
      setFault(null);
      if (typeof onCommitAsset === 'function') {
        onCommitAsset(packet);
      }
    } catch (err) {
      setFault(`PACKET_FAULT: ${err.message}`);
    }
  }, [onCommitAsset]);

  const handleImportFile = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const isPixelBrainPacket = data?.kind === 'pixelbrain.asset.v1'
          || Array.isArray(data?.geometry?.coordinates)
          || Array.isArray(data?.coordinates);
        const result = isPixelBrainPacket
          ? importFromPixelBrainAssetPacket(data, { layerBy: 'part' })
          : importFromAseprite(data);
        if (!result.ok) {
          setFault(`IMPORT_FAULT: ${result.error || 'INVALID_IMPORT'}`);
          return;
        }
        const grid = result.template || result;
        gridRef.current = grid;
        commandStackRef.current?.clear();
        setGridType(grid.gridType);
        setCellSize(grid.cellSize);
        setAxes([...grid.symmetryAxes]);
        setPalette(grid.palette || []);
        setActiveLayerIndex(0);
        setCursor({ col: 0, row: 0 });
        setFault(null);
        setRevision(r => r + 1);
      } catch (err) {
        setFault(`IMPORT_FAULT: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const activeGrid = gridRef.current;
  const cellCount = activeGrid?.layers[0]?.cells.size ?? 0;
  const activeLayer = activeGrid?.layers?.[activeLayerIndex] || activeGrid?.layers?.[0] || null;

  useImperativeHandle(ref, () => ({
    importImage: async (file) => {
      if (!file) return;
      const img = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Raster imports are per-pixel: they need a rectangular, cellSize-1
      // lattice. Writing raw pixel coords into a hex/coarse grid would put
      // every cell off-lattice, so rebuild the grid when the dialect differs.
      let grid = gridRef.current;
      if (!grid || grid.gridType !== GRID_TYPES.RECTANGULAR || grid.cellSize !== 1) {
        grid = createTemplateGrid({
          width: grid?.width || 64,
          height: grid?.height || 80,
          cellSize: 1,
          gridType: GRID_TYPES.RECTANGULAR,
        });
        gridRef.current = grid;
        setGridType(GRID_TYPES.RECTANGULAR);
        setCellSize(1);
      }

      const w = grid.width;
      const h = grid.height;

      // Draw the image to a temp canvas at exact grid resolution (no smoothing for pixel fidelity)
      const temp = document.createElement('canvas');
      temp.width = w;
      temp.height = h;
      const tctx = temp.getContext('2d', { willReadFrequently: true });
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(img, 0, 0, w, h);

      const idata = tctx.getImageData(0, 0, w, h);
      const data = idata.data;

      // Prepare a fresh layer for the full image import (to get the "whole thing")
      const importLayer = createLayer('Imported Image');
      importLayer.visible = true;
      importLayer.opacity = 1;

      // Replace layers with this one for a clean full raster import
      grid.layers = [importLayer];

      // Populate every pixel from the image (this gives the full thing, not just bits/edges)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const a = data[i + 3];
          if (a > 10) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            setCell(importLayer, x, y, hex);
          }
        }
      }

      commandStackRef.current?.clear();
      setActiveLayerIndex(0);
      setPalette([]);
      setRevision(r => r + 1);
      setFault(null);
    },

    importAse: async (file) => {
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const result = importAsepriteBinaryToFoundryAsset(buffer, { layerBy: 'part' });

        if (!result || result.ok === false) {
          const errMsg = result?.error || 'Unknown ASE import error';
          setFault(`ASE_BINARY_IMPORT_FAULT: ${errMsg}`);
          return;
        }

        // The binary importer returns a foundry-style result that contains .grid from importFromAseprite
        const grid = result.grid || result.template || result;
        if (!grid) {
          setFault('ASE_BINARY_IMPORT_FAULT: No grid data in import result');
          return;
        }

        gridRef.current = grid;
        commandStackRef.current?.clear();

        // Force layers visible for full composite view after ASE import
        if (grid.layers && Array.isArray(grid.layers)) {
          grid.layers.forEach((layer) => {
            layer.visible = true;
            if (typeof layer.opacity !== 'number' || layer.opacity < 0.1) layer.opacity = 1;
          });
        }

        setGridType(grid.gridType || GRID_TYPES.RECTANGULAR);
        setCellSize(grid.cellSize || 1);
        setAxes([...(grid.symmetryAxes || [])]);
        setPalette(grid.palette || []);
        setActiveLayerIndex(0);
        setCursor({ col: 0, row: 0 });
        setFault(null);
        setRevision(r => r + 1);

        // Optional: after binary ASE import, try to fit a reasonable zoom
        // (the caller in the page can also adjust)
      } catch (err) {
        console.error('ASE binary import failed', err);
        setFault(`ASE_BINARY_IMPORT_FAULT: ${err.message}`);
      }
    },

    getGridDimensions: () => {
      const g = gridRef.current;
      if (!g) return { width: 64, height: 80 };
      return { width: g.width || 64, height: g.height || 80 };
    },

    setBrushColor: (hex) => {
      if (typeof hex === 'string' && hex.startsWith('#')) {
        setBrushColor(hex);
      }
    },

    setTool: (newTool) => {
      if (TOOLS.some(t => t.id === newTool)) {
        setTool(newTool);
      }
    },

    // For syncing the right-side LayerStackPanel eyes/locks to the visual canvas
    syncLayerVisibility: (externalLayers) => {
      const g = gridRef.current;
      if (!g || !g.layers || !externalLayers) return;
      externalLayers.forEach((ext, i) => {
        if (g.layers[i]) {
          g.layers[i].visible = !!ext.visible;
          g.layers[i].locked = !!ext.locked;
          if (typeof ext.opacity === 'number') g.layers[i].opacity = ext.opacity;
        }
      });
      setRevision(r => r + 1);
    },

    setActiveLayer: (index) => {
      setActiveLayerIndex(index);
      setRevision(r => r + 1);
    },

    getLayers: () => {
      const g = gridRef.current;
      return g && g.layers ? g.layers.map(l => ({...l})) : [];
    },

    // Allow external (e.g. custom palette) to force a brush update and redraw if needed
    forceRedraw: () => setRevision(r => r + 1),

    undo: () => {
      const stack = commandStackRef.current;
      if (stack && typeof stack.canUndo === 'function' && stack.canUndo()) {
        stack.undo();
        setUndoStackVersion(v => v + 1);
        setRevision(r => r + 1);
      }
    },

    redo: () => {
      const stack = commandStackRef.current;
      if (stack && typeof stack.canRedo === 'function' && stack.canRedo()) {
        stack.redo();
        setUndoStackVersion(v => v + 1);
        setRevision(r => r + 1);
      }
    },

    // The live engine grid - the single document model shared with the page panels.
    getGrid: () => gridRef.current,

    // Native .aseprite export of the canvas (same path as the in-editor button).
    exportAse: () => handleExportNativeAseprite(),

    // 1:1 PNG export of the visible canvas layers (reference guides excluded).
    exportPng: () => {
      const grid = gridRef.current;
      if (!grid) return;
      const out = document.createElement('canvas');
      out.width = grid.width;
      out.height = grid.height;
      const ctx = out.getContext('2d');
      if (!ctx) {
        setFault('PNG_EXPORT_FAULT: 2d context unavailable');
        return;
      }
      ctx.imageSmoothingEnabled = false;
      const metrics = getGridMetrics(grid);
      (grid.layers || []).forEach(layer => {
        if (!layer || layer.visible === false || layer.type === 'reference') return;
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
        layer.cells.forEach(cell => {
          ctx.fillStyle = cell.color;
          if (metrics.hexRadius) {
            ctx.beginPath();
            traceHexPath(ctx, cell.x, cell.y, metrics.hexRadius);
            ctx.fill();
          } else {
            ctx.fillRect(cell.x, cell.y, metrics.cellSize, metrics.cellSize);
          }
        });
      });
      ctx.globalAlpha = 1;
      out.toBlob(blob => {
        if (!blob) {
          setFault('PNG_EXPORT_FAULT: encode failed');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${grid.sourcePacket?.id || 'pixelbrain_asset'}.png`;
        link.click();
        URL.revokeObjectURL(url);
      });
      setFault(null);
    },

    // Insert/replace the 00_Reference construction layer on the live canvas
    // (guides were previously written to a shadow document the canvas never rendered).
    applyReferenceGuides: (cells, name = '00_Reference') => {
      const grid = gridRef.current;
      if (!grid || !Array.isArray(grid.layers) || !Array.isArray(cells)) return;
      const refLayer = createReferenceLayer(
        name,
        { dimensions: { width: grid.width, height: grid.height } },
        cells
      );
      const previousActive = grid.layers[activeLayerIndex];
      grid.layers = [refLayer, ...grid.layers.filter(l => l?.type !== 'reference')];
      // Keep the active layer paintable: never leave it pointing at the locked guides.
      const restored = grid.layers.indexOf(previousActive);
      setActiveLayerIndex(restored > 0 ? restored : Math.min(1, grid.layers.length - 1));
      setRevision(r => r + 1);
    },

    // Connective tissue for disconnected AMPs + reference layers (System 5/8)
    // Delegates to adapter (canvas remains "dumb" surface; panel drives via these commands)
    // Also syncs full layer data (cells + flags) from external document model (currentDocument) to visual grid.
    syncDocumentLayers: (layers) => {
      const g = gridRef.current;
      if (!g || !layers) return;
      g.layers = layers.map((l) => {
        const copy = { ...l };
        if (l.cells) {
          if (l.cells instanceof Map) copy.cells = new Map(l.cells);
          else if (Array.isArray(l.cells)) copy.cells = [...l.cells];
          else copy.cells = l.cells;
        }
        return copy;
      });
      setRevision((r) => r + 1);
    },

    applyAMP: (ampId, options = {}) => {
      const g = gridRef.current;
      const stack = commandStackRef.current;
      if (!g || !g.layers || !g.layers.length) return { description: 'no grid' };
      const li = Number.isInteger(options.layerIndex) ? options.layerIndex : activeLayerIndex;
      const layer = g.layers[li];
      if (!layer) return { description: 'no layer' };

      // Snapshot *full* layers before the AMP (including all cell Maps). This makes undo/redo robust for both
      // simple cell mutations and structural ops (SDF/Noise that add layers). Replaces the old heuristic pop.
      const prevLayersSnapshot = (g.layers || []).map(l => ({
        name: l?.name,
        visible: !!l?.visible,
        locked: !!l?.locked,
        opacity: typeof l?.opacity === 'number' ? l.opacity : 1,
        cells: l?.cells instanceof Map ? new Map(l.cells) : (Array.isArray(l?.cells) ? [...l.cells] : new Map())
      }));

      try {
        let description = `AMP ${ampId}`;
        if (ampId.includes('sharp') || ampId.includes('square') || (options.ampName || '').includes('square')) {
          const enhanced = enhanceSquaresForRender(layer.cells, { intensity: options.intensity || 0.8 });
          applyAMPToLayer(g, li, 'square-sharpness', enhanced);
          description = 'Square Sharpness & Contrast';
        } else if (ampId.includes('symmetry') || (options.ampName || '').includes('symmetry')) {
          runSymmetryAmpProcessor({ grid: g, layerIndex: li, ...options });
          description = 'Symmetry AMP';
        } else if (ampId === 'sdf-shape' || (options.ampName || '').includes('sdfShape') || ampId.includes('sdf')) {
          // Generative SDF -> always land on new layer for non-destructive epic shaping (PDR compliant: lattice cells only)
          const cellsArr = layer.cells instanceof Map ? Array.from(layer.cells.values()) : (Array.isArray(layer.cells) ? layer.cells : []);
          const processed = sdfShapeEditorAmp(cellsArr, { color: options.color, sdf: options.sdf ? normalizePB_SDF_v1(options.sdf) : undefined });
          const newL = createLayer(`${layer.name || 'Layer'}-SDF`);
          processed.forEach(c => setCell(newL, c.x, c.y, c.color, c.emphasis || 1));
          g.layers.push(newL);
          description = 'SDF Shape';
          // force active to new for immediate visibility
          // (caller can still switch)
        } else if (ampId === 'noise-fill' || (options.ampName || '').includes('noiseFill') || ampId.includes('noise')) {
          const cellsArr = layer.cells instanceof Map ? Array.from(layer.cells.values()) : (Array.isArray(layer.cells) ? layer.cells : []);
          const processed = noiseFillEditorAmp(cellsArr, { noise: options.noise ? normalizePB_NOISE_v1(options.noise) : undefined });
          if (options.createNewLayer) {
            const newL = createLayer(`${layer.name || 'Layer'}-NOISE`);
            processed.forEach(c => setCell(newL, c.x, c.y, c.color, c.emphasis || 1));
            g.layers.push(newL);
          } else {
            layer.cells.clear();
            processed.forEach(c => setCell(layer, c.x, c.y, c.color, c.emphasis || 1));
          }
          description = 'Noise Fill';
        } else {
          applyAMPToLayer(g, li, ampId, options);
        }

        const afterLayersSnapshot = (g.layers || []).map(l => ({
          name: l?.name,
          visible: !!l?.visible,
          locked: !!l?.locked,
          opacity: typeof l?.opacity === 'number' ? l.opacity : 1,
          cells: l?.cells instanceof Map ? new Map(l.cells) : (Array.isArray(l?.cells) ? [...l.cells] : new Map())
        }));

        // Record in command stack. Full layer snapshots (prev/after) make both undo and redo correct even when
        // the AMP added/removed layers or mutated multiple things. Structural flag kept for future introspection.
        if (stack) {
          stack.execute(new Command({
            doFn: () => {
              g.layers = afterLayersSnapshot.map(s => ({ ...s, cells: s.cells instanceof Map ? new Map(s.cells) : s.cells }));
              setRevision((r) => r + 1);
            },
            undoFn: () => {
              g.layers = prevLayersSnapshot.map(s => ({ ...s, cells: s.cells instanceof Map ? new Map(s.cells) : s.cells }));
              setRevision((r) => r + 1);
            },
            description: `AMP ${description}`,
            meta: { type: 'amp', ampId, layerIndex: li, structural: (ampId === 'sdf-shape' || ampId === 'noise-fill') },
          }));
        }

        // Also push to our UI-visible log for history list + recipe export (deterministic provenance)
        commandLogRef.current.push({
          id: Date.now(),
          description: `${description} (layer ${li})`,
          ampId,
          options: { ...options },
          layerIndex: li,
          timestamp: Date.now(),
          isPreview: false,
        });

        setRevision((r) => r + 1);
        return { description: `${description} applied` };
      } catch (e) {
        console.error('applyAMP failed', e);
        return { description: 'AMP error: ' + e.message };
      }
    },

    // Fresh replacement helpers (support "import always replaces previous" without destructive remount that would lose the just-imported raster).
    resetView: () => {
      // Defensive access: panRef may be viewport-managed in the current build; scroll reset + zoom give the "fresh" feel.
      try {
        // eslint-disable-next-line no-undef
        if (typeof panRef !== 'undefined' && panRef) panRef.current = { x: 0, y: 0 };
      } catch (_) { /* noop: panRef viewport may be conditionally present */ }
      setZoom(8);
      if (canvasContainerRef.current) {
        canvasContainerRef.current.scrollLeft = 0;
        canvasContainerRef.current.scrollTop = 0;
      }
      setRevision((r) => r + 1);
    },

    clearCommandStack: () => {
      commandStackRef.current = createCommandStack();
      setUndoStackVersion((v) => v + 1);
      setRevision((r) => r + 1);
    },

    // === New methods for the remaining disparities (preview, history, recipe) ===

    // Non-destructive preview: performs the AMP visually (and on stack for easy discard via undo) but tags the log entry.
    // Page/Panel shows "Previewing..." state + Commit / Discard buttons.
    previewAMP: (ampId, options = {}) => {
      // Perform a preview apply by doing the visual mutation + log entry tagged as preview.
      // Discard will undo via the stack. This gives the "live preview" feel without a separate temp grid.
      const g = gridRef.current;
      const stack = commandStackRef.current;
      if (!g || !g.layers || !g.layers.length) return { description: 'no grid' };
      const li = Number.isInteger(options.layerIndex) ? options.layerIndex : activeLayerIndex;
      const layer = g.layers[li];
      if (!layer) return { description: 'no layer' };

      // Full layers snapshot before (same as applyAMP) for robust undo/redo on structural + simple AMPs.
      const prevLayersSnapshot = (g.layers || []).map(l => ({
        name: l?.name,
        visible: !!l?.visible,
        locked: !!l?.locked,
        opacity: typeof l?.opacity === 'number' ? l.opacity : 1,
        cells: l?.cells instanceof Map ? new Map(l.cells) : (Array.isArray(l?.cells) ? [...l.cells] : new Map())
      }));

      let description = `AMP ${ampId} (preview)`;
      try {
        if (ampId.includes('sharp') || ampId.includes('square') || (options.ampName || '').includes('square')) {
          const enhanced = enhanceSquaresForRender(layer.cells, { intensity: options.intensity || 0.8 });
          applyAMPToLayer(g, li, 'square-sharpness', enhanced);
          description = 'Square Sharpness & Contrast (preview)';
        } else if (ampId.includes('symmetry') || (options.ampName || '').includes('symmetry')) {
          runSymmetryAmpProcessor({ grid: g, layerIndex: li, ...options });
          description = 'Symmetry AMP (preview)';
        } else if (ampId === 'sdf-shape' || (options.ampName || '').includes('sdfShape') || ampId.includes('sdf')) {
          const cellsArr = layer.cells instanceof Map ? Array.from(layer.cells.values()) : (Array.isArray(layer.cells) ? layer.cells : []);
          const processed = sdfShapeEditorAmp(cellsArr, { color: options.color, sdf: options.sdf ? normalizePB_SDF_v1(options.sdf) : undefined });
          const newL = createLayer(`${layer.name || 'Layer'}-SDF`);
          processed.forEach(c => setCell(newL, c.x, c.y, c.color, c.emphasis || 1));
          g.layers.push(newL);
          description = 'SDF Shape (preview)';
        } else if (ampId === 'noise-fill' || (options.ampName || '').includes('noiseFill') || ampId.includes('noise')) {
          const cellsArr = layer.cells instanceof Map ? Array.from(layer.cells.values()) : (Array.isArray(layer.cells) ? layer.cells : []);
          const processed = noiseFillEditorAmp(cellsArr, { noise: options.noise ? normalizePB_NOISE_v1(options.noise) : undefined });
          if (options.createNewLayer) {
            const newL = createLayer(`${layer.name || 'Layer'}-NOISE`);
            processed.forEach(c => setCell(newL, c.x, c.y, c.color, c.emphasis || 1));
            g.layers.push(newL);
          } else {
            layer.cells.clear();
            processed.forEach(c => setCell(layer, c.x, c.y, c.color, c.emphasis || 1));
          }
          description = 'Noise Fill (preview)';
        } else {
          applyAMPToLayer(g, li, ampId, options);
        }

        const afterLayersSnapshot = (g.layers || []).map(l => ({
          name: l?.name,
          visible: !!l?.visible,
          locked: !!l?.locked,
          opacity: typeof l?.opacity === 'number' ? l.opacity : 1,
          cells: l?.cells instanceof Map ? new Map(l.cells) : (Array.isArray(l?.cells) ? [...l.cells] : new Map())
        }));

        if (stack) {
          stack.execute(new Command({
            doFn: () => {
              g.layers = afterLayersSnapshot.map(s => ({ ...s, cells: s.cells instanceof Map ? new Map(s.cells) : s.cells }));
              setRevision((r) => r + 1);
            },
            undoFn: () => {
              g.layers = prevLayersSnapshot.map(s => ({ ...s, cells: s.cells instanceof Map ? new Map(s.cells) : s.cells }));
              setRevision((r) => r + 1);
            },
            description,
            meta: { type: 'amp-preview', ampId, layerIndex: li, structural: (ampId === 'sdf-shape' || ampId === 'noise-fill') },
          }));
        }

        commandLogRef.current.push({
          id: Date.now(),
          description,
          ampId,
          options: { ...options },
          layerIndex: li,
          timestamp: Date.now(),
          isPreview: true,
        });

        setRevision((r) => r + 1);
        return { description, isPreview: true };
      } catch (e) {
        console.error('previewAMP failed', e);
        return { description: 'preview error' };
      }
    },

    commitPreview: () => {
      const log = commandLogRef.current;
      if (log.length > 0 && log[log.length - 1].isPreview) {
        log[log.length - 1].isPreview = false;
      }
      setRevision((r) => r + 1);
    },

    discardPreview: () => {
      const stack = commandStackRef.current;
      if (stack && typeof stack.canUndo === 'function' && stack.canUndo()) {
        stack.undo();
      }
      const log = commandLogRef.current;
      if (log.length > 0 && log[log.length - 1].isPreview) {
        log.pop();
      }
      setRevision((r) => r + 1);
    },

    getCommandHistory: () => {
      return commandLogRef.current.map((entry, idx) => ({ ...entry, index: idx }));
    },

    // Jump/scrub the history (used by the visible list)
    jumpToCommand: (targetIdx) => {
      const stack = commandStackRef.current;
      const log = commandLogRef.current;
      if (!stack || !log.length) return;
      const current = log.length - 1; // rough; in practice we can track better with a currentIdx state
      if (targetIdx > current) {
        for (let i = current; i < targetIdx && (stack.canRedo && stack.canRedo()); i++) {
          stack.redo();
          setUndoStackVersion(v => v + 1);
          setRevision(r => r + 1);
        }
      } else {
        for (let i = current; i > targetIdx && (stack.canUndo && stack.canUndo()); i--) {
          stack.undo();
          setUndoStackVersion(v => v + 1);
          setRevision(r => r + 1);
        }
      }
    }
  }));

  return (
    <div className="template-editor">
      <section className="editor-canvas-panel" aria-label="Lattice canvas">
        <div className="canvas-container" ref={canvasContainerRef}>
          <canvas
            ref={canvasRef}
            className="editor-canvas editor-canvas--interactive"
            tabIndex={0}
            aria-label={`Lattice template canvas, ${gridType} grid. Arrow keys move the cell cursor, Enter applies the ${tool} tool, Delete erases. Right-click for color info.`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPainting}
            onPointerLeave={stopPainting}
            onKeyDown={handleKeyDown}
            onContextMenu={handleContextMenu}
          />
        </div>
        <div className="zoom-controls">
          <button type="button" onClick={() => stepZoom(-1)} aria-label="Zoom out">−</button>
          <span aria-live="polite">{zoom}×</span>
          <button type="button" onClick={() => stepZoom(1)} aria-label="Zoom in">+</button>
        </div>
        <div className="editor-status-line telemetry-text" aria-live="polite">
          {activeGrid ? `${activeGrid.width}×${activeGrid.height} · ${gridType.toUpperCase()} · LAYER: ${activeLayer?.name || 'none'} · CELLS: ${cellCount}` : 'FORGING_LATTICE...'}
          {fault ? ` · ${fault}` : ''}
        </div>
        {pickedColorInfo && (
          <div style={{ fontSize: '10px', marginTop: '4px', padding: '2px 4px', background: '#112211', border: '1px solid #0a4', color: '#0f0' }}>
            Right-click: ({pickedColorInfo.col}, {pickedColorInfo.row}) color: {pickedColorInfo.color} {pickedColorInfo.layer ? `(${pickedColorInfo.layer})` : ''}
            <button onClick={() => setPickedColorInfo(null)} style={{ marginLeft: '6px', fontSize: '9px' }}>×</button>
          </div>
        )}
      </section>

      <aside className="editor-controls-panel" aria-label="Lattice tools">
        <div className="tool-selector" role="group" aria-label="Editing tool">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? 'active' : ''}
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="color-picker">
          <h4 id="template-brush-color">Brush Glyph Colour</h4>
          <input
            type="color"
            value={brushColor}
            aria-labelledby="template-brush-color"
            onChange={(e) => setBrushColor(e.target.value.toUpperCase())}
          />
          <span>{brushColor}</span>
        </div>

        {palette.length > 0 && (
          <div className="template-palette" aria-label="Imported exact palette">
            <h4>Exact Palette</h4>
            <div className="template-palette__swatches">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={color === brushColor ? 'active' : ''}
                  aria-label={`Use ${color}`}
                  title={color}
                  onClick={() => setBrushColor(color)}
                >
                  <span style={{ backgroundColor: color }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid-selector">
          <h4>Grid Dialect</h4>
          <div className="grid-type-buttons" role="group" aria-label="Grid type">
            {GRID_TYPE_OPTIONS.map(type => (
              <button
                key={type}
                type="button"
                className={gridType === type ? 'active' : ''}
                aria-pressed={gridType === type}
                onClick={() => setGridType(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="formula-params">
          <h4>Lattice Parameters</h4>
          <div className="param-slider">
            <label htmlFor="template-cell-size">Cell Size</label>
            <input
              id="template-cell-size"
              type="range"
              min="4"
              max="32"
              step="2"
              value={cellSize}
              onChange={(e) => setCellSize(parseInt(e.target.value, 10))}
            />
            <span className="param-value">{cellSize}px</span>
          </div>
        </div>

        <div className="symmetry-toggles" role="group" aria-label="Symmetry axes">
          <h4>Symmetry</h4>
          {SYMMETRY_AXES.map(axis => (
            <button
              key={axis.id}
              type="button"
              className={axes.includes(axis.id) ? 'active' : ''}
              aria-pressed={axes.includes(axis.id)}
              onClick={() => handleToggleAxis(axis.id)}
            >
              {axis.label}
            </button>
          ))}
        </div>

        {/* Simple layer selector to allow painting on different parts (e.g. body vs pauldron) */}
        {gridRef.current && gridRef.current.layers && gridRef.current.layers.length > 0 && (
          <div className="layer-selector" style={{ marginTop: '8px' }}>
            <h4>Layers (click to activate for painting)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {gridRef.current.layers.map((layer, idx) => (
                <button
                  key={idx}
                  type="button"
                  style={{
                    textAlign: 'left',
                    fontSize: '9px',
                    padding: '1px 4px',
                    background: idx === activeLayerIndex ? '#0a4' : '#222',
                    border: '1px solid #444',
                    color: idx === activeLayerIndex ? '#fff' : '#ccc'
                  }}
                  onClick={() => setActiveLayerIndex(idx)}
                >
                  {layer.name || `Layer ${idx}`} {layer.locked ? '🔒' : ''} {layer.visible ? '' : '👁🗨'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '8px', color: '#666', marginTop: '2px' }}>
              Paint only affects the active (highlighted) layer.
            </div>
          </div>
        )}

        <button type="button" className="export-btn" onClick={handleExport}>
          EXPORT_TEMPLATE_JSON
        </button>
        <button
          type="button"
          className="export-btn"
          aria-label="Export a one-to-one native Aseprite replica"
          onClick={handleExportNativeAseprite}
        >
          EXPORT_1TO1_ASEPRITE
        </button>
        <button type="button" className="export-btn" onClick={handleCommitAsset}>
          COMMIT_AS_ASSET_PACKET
        </button>
        <label className="import-label" htmlFor="template-import-input">
          IMPORT_TEMPLATE_JSON
        </label>
        <input
          id="template-import-input"
          type="file"
          accept="application/json"
          className="import-input"
          onChange={handleImportFile}
        />
      </aside>
    </div>
  );
}

const TemplateEditor = forwardRef(TemplateEditorComponent);
export default TemplateEditor;
// Named export kept for the QA suite and any non-lazy consumers.
export { TemplateEditor };
