/**
 * PixelBrainPage - Photoshop-for-Pixels Editor
 *
 * The home view is JUST the canvas.
 * All special PixelBrain functions (Critique, Construction, Drills, Aseprite roundtrips, etc.)
 * are exposed as explicit buttons in the top bar and left toolbar.
 *
 * Aesthetic: Classic pixel art editor (dark, focused, crisp pixels) - "Photoshop but for pixels".
 *
 * UI SPEC:
 * - World-law connection: The lattice is the playable surface of spatial bytecode. The editor chrome exists only to serve direct, precise manipulation of that surface and the professional discipline (construction first, critique, limited palettes, clean execution).
 * - The canvas (TemplateEditor) is sovereign. Everything else is a button or a minimal supporting panel.
 * - Data: All heavy lifting goes through the pixelbrain.adapter. No direct codex imports.
 * - State: ONE document model. The TemplateEditor owns the live engine grid and reports
 *   it via onGridChange; every side panel (layers, palette, mentor, AMP) reads that same
 *   grid and mutates it through editorRef commands. There is no shadow document.
 */

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  createTemplateGrid,
  createLayer,
  buildConstructionGuideCells,
  generatePixelArtFromImage,
  analyzeImageToFormula,
  runForgeCraftGate,
  runForgeCraftGateWithBlueprint,
} from "../../lib/pixelbrain.adapter.js";

import { LayerStackPanel } from "./components/LayerStackPanel.jsx";
import { IndexedPalettePanel } from "./components/IndexedPalettePanel.jsx";
import MentorCritiquePanel from "./components/MentorCritiquePanel.jsx";
import { AMPApplyPanel } from "./components/AMPApplyPanel.jsx";
import { ReferencePanel } from "./components/ReferencePanel.jsx";
import { ForgeGatePanel } from "./components/ForgeGatePanel.jsx";

const TemplateEditor = lazy(() => import('./components/TemplateEditor.jsx'));
const PixelBrainTerminal = lazy(() => import('./PixelBrainTerminal.jsx'));

import "./PixelBrainPage.css";

export default function PixelBrainPage() {
  const [activeTool, setActiveTool] = useState('paint');
  const [showPixelBrainPanel, setShowPixelBrainPanel] = useState(true);
  const [showLayersPanel, setShowLayersPanel] = useState(true);
  const [showPalettePanel, setShowPalettePanel] = useState(true);
  const [showAmpPanel, setShowAmpPanel] = useState(true);
  const [showRefPanel, setShowRefPanel] = useState(true);
  const [showForgeGatePanel, setShowForgeGatePanel] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  // For AMP non-destructive preview (addresses "no live/preview for AMPs")
  const [isAMPPreviewing, setIsAMPPreviewing] = useState(false);

  // Core document model (the one the right panels and mentor consume).
  // The TemplateEditor owns the authoritative live grid; we keep a synced copy here for the tool side.
  const [currentDocument, setCurrentDocument] = useState(() => {
    const g = createTemplateGrid({ width: 64, height: 80, cellSize: 1 });
    g.layers = [createLayer('00_Reference'), createLayer('10_Structure')];
    return g;
  });

  const editorRef = useRef(null);
  const [rightActiveLayer, setRightActiveLayer] = useState(0);

  // Dynamic asset for the main visual editor. Starts empty - load via Open File.
  const [activeAssetPacket, setActiveAssetPacket] = useState(null);
  const [editorInstanceKey, setEditorInstanceKey] = useState(0);

  // The single document model: the live engine grid owned by TemplateEditor.
  // `rev` changes on every canvas mutation so panels re-render against the
  // same (intentionally mutable) grid object.
  const [canvasDoc, setCanvasDoc] = useState(null);
  const handleGridChange = useCallback((grid, rev) => {
    setCanvasDoc({ grid, rev });
  }, []);
  const canvasGrid = canvasDoc?.grid || null;

  // In-world status line (faults, drill results). The LAW forbids alert boxes.
  const [pageNotice, setPageNotice] = useState(null);

  // External trigger for the mentor panel's critique run.
  const [critiqueToken, setCritiqueToken] = useState(0);

  // Drill mode state (for Void Shield Drill button)
  const [isDrillActive, setIsDrillActive] = useState(false);
  const [drillSecondsLeft, setDrillSecondsLeft] = useState(0);
  const drillTimerRef = useRef(null);

  // Custom user palette (top-right box). Max 12 colors, editable by hex input.
  const [customPalette, setCustomPalette] = useState([
    '#C9A227', '#00E5FF', '#1B1B27', '#FFFFFF', '#000000', '#4A90D9', '#E5E5E5'
  ]); // start with some theme colors, user can add/edit up to 12

  const addCustomColor = () => {
    if (customPalette.length >= 12) return;
    const newColor = '#C9A227'; // default to theme gold
    setCustomPalette([...customPalette, newColor]);
  };

  const removeCustomColor = (index) => {
    const next = customPalette.filter((_, i) => i !== index);
    setCustomPalette(next.length > 0 ? next : ['#000000']);
  };

  const updateCustomColor = (index, value) => {
    let v = value.trim().toUpperCase();
    if (!v.startsWith('#')) v = '#' + v;
    // basic validation / normalization
    if (v.length > 7) v = v.slice(0, 7);
    // allow partial input while typing
    const next = [...customPalette];
    next[index] = v;
    setCustomPalette(next);
  };

  const setBrushFromPalette = (color) => {
    if (editorRef.current && editorRef.current.setBrushColor) {
      // normalize to full hex if possible
      let c = color.toUpperCase();
      if (!c.startsWith('#')) c = '#' + c;
      if (c.length === 4) {
        // expand #rgb to #rrggbb
        c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      }
      if (!/^#[0-9A-F]{6}$/.test(c)) return; // ignore partial/invalid hex
      editorRef.current.setBrushColor(c);
      if (editorRef.current?.forceRedraw) editorRef.current.forceRedraw();
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.aseprite,.ase';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file || !editorRef.current) return;

      try {
        const isAse = file.name.toLowerCase().endsWith('.ase') || file.name.toLowerCase().endsWith('.aseprite');
        if (isAse) {
          await editorRef.current?.importAse?.(file);
        } else {
          // Full pixel import for the whole image (no edge detection / bits-and-pieces)
          await editorRef.current.importImage(file);
        }

        // Always replace the previous thing (chestplate or prior asset).
        // Packet null prevents chestplate reload effects; reset gives fresh view/undo on the (live) instance that received the raster.
        // Full currentDocument sync for panels is done via the same pattern as other replace paths (PDR + top boon from disparity reconciliation).
        setActiveAssetPacket(null);

        // Fresh-instance feel without key bump (key bump would unmount the instance that just did the full raster importImage).
        editorRef.current?.resetView?.();
        editorRef.current?.clearCommandStack?.();

        setPageNotice(null);
      } catch (err) {
        setPageNotice(`IMPORT FAULT - ${err.message}`);
      }
    };
    input.click();
  };

  const handleNew = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.json,.aseprite,.ase';

    // Cancelling the picker means "blank project". File inputs do not fire
    // `change` on cancel - only the `cancel` event covers this path.
    input.oncancel = () => {
      setActiveAssetPacket(null);
      setEditorInstanceKey(k => k + 1);
      setPageNotice('New blank lattice forged.');
    };

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const lower = file.name.toLowerCase();

      try {
        if (lower.endsWith('.json')) {
          const text = await file.text();
          const pkt = JSON.parse(text);
          // Remount the editor with the new packet; it imports the grid itself
          // and reports it back through onGridChange.
          setActiveAssetPacket(pkt);
          setEditorInstanceKey(k => k + 1);
        } else if (lower.endsWith('.ase') || lower.endsWith('.aseprite')) {
          await editorRef.current?.importAse?.(file);
          setActiveAssetPacket(null);
        } else if (editorRef.current?.importImage) {
          // Image - full raster import into the existing editor instance.
          // Always replace previous (including any chestplate in the tool document).
          await editorRef.current.importImage(file);
          setActiveAssetPacket(null);
        }

        // For non-JSON "New from file", ensure previous is replaced (packet null + resets).
        // (The visual raster replacement happens in the import* call; panels converge on subsequent operations or explicit syncs per the approved editor PDR.)
        if (!lower.endsWith('.json')) {
          editorRef.current?.resetView?.();
          editorRef.current?.clearCommandStack?.();
        }

        setPageNotice(null);
      } catch (err) {
        setPageNotice(`LOAD FAULT - ${err.message}`);
      }
    };
    input.click();
  };

  // Cleanup drill timer on unmount
  useEffect(() => {
    return () => {
      if (drillTimerRef.current) clearInterval(drillTimerRef.current);
    };
  }, []);

  // Global keyboard shortcuts for undo/redo (Ctrl+Z / Cmd+Z, Ctrl+Shift+Z / Ctrl+Y)
  // This works even if the canvas isn't focused, and delegates to the editor's command stack.
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (editorRef.current?.redo) editorRef.current.redo();
        } else {
          if (editorRef.current?.undo) editorRef.current.undo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (editorRef.current?.redo) editorRef.current.redo();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Construction guides, drawn on the live canvas grid (00_Reference layer).
  const applyConstructionGuides = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const dims = editor.getGridDimensions ? editor.getGridDimensions() : { width: 64, height: 80 };
    const guideCells = buildConstructionGuideCells(dims);
    editor.applyReferenceGuides?.(guideCells, '00_Reference');
  };

  // "Create it via Pixelbrain" - the Eclipse Ward Pauldron (user recipe) + SDF/Noise from PDR.
  // Uses editor ref + new AMPs (sdf-shape + noise-fill) + layers + command history for full deterministic cockpit flow.
  // Matches the 10-step pauldron recipe (New 64x80, CNSTR, PENCIL on named layers, AMPs, polish, export recipe).
  // Cleaned: no remount/key-bump/timeout hack. Operates synchronously in-place on the live grid for reliability.
  const createEclipseWardPauldronViaPixelBrain = () => {
    const editor = editorRef.current;
    if (!editor) {
      setPageNotice('Editor not ready');
      return;
    }

    // ensure clean (in place, no remount)
    if (editor.clearCommandStack) editor.clearCommandStack();
    if (editor.resetView) editor.resetView();

    const g = editor.getGrid && editor.getGrid();
    if (!g) {
      setPageNotice('No active grid');
      return;
    }

    const dims = editor.getGridDimensions ? editor.getGridDimensions() : { width: 64, height: 80 };

    // 2. Layers per recipe (fresh canonical set)
    g.layers = [
      createLayer('00_Reference'),
      createLayer('10_Structure'),
      createLayer('20_Energy'),
      createLayer('30_Focal'),
      createLayer('40_Polish'),
      createLayer('50_Final'),
    ];

    // 3. Construction guides (CNSTR) - prefer the editor API
    const guides = buildConstructionGuideCells ? buildConstructionGuideCells(dims) : [];
    if (editor.applyReferenceGuides) {
      editor.applyReferenceGuides(guides, '00_Reference');
    } else if (g.layers[0]) {
      // fallback direct
      guides.forEach(c => {
        if (!g.layers[0].cells) g.layers[0].cells = new Map();
        g.layers[0].cells.set(`${c.x},${c.y}`, { x: c.x, y: c.y, color: c.color || '#888', emphasis: 1 });
      });
    }

    function setCellOnLayer(layer, x, y, col) {
      if (!layer) return;
      if (!layer.cells) layer.cells = new Map();
      const key = `${x},${y}`;
      layer.cells.set(key, { x, y, color: col, emphasis: 1 });
    }

    // 4. Draw deterministic rings/radials + focal structure directly on layers (lattice first, per manual)
    if (g.layers[1]) {
      const L = g.layers;
      const centerX = 32, centerY = 40;

      // structure ring + radials (10_Structure)
      for (let r = 6; r <= 18; r += 3) {
        for (let a = 0; a < 360; a += 30) {
          const rad = (a * Math.PI) / 180;
          const x = Math.round(centerX + Math.cos(rad) * r);
          const y = Math.round(centerY + Math.sin(rad) * r * 0.9);
          if (x >= 0 && x < dims.width && y >= 0 && y < dims.height) setCellOnLayer(L[1], x, y, '#C9A227');
        }
      }

      // energy spokes (20_Energy)
      for (let a = 0; a < 360; a += 45) {
        const rad = (a * Math.PI) / 180;
        for (let d = 4; d < 22; d++) {
          const x = Math.round(centerX + Math.cos(rad) * d);
          const y = Math.round(centerY + Math.sin(rad) * d * 0.85);
          if (x >= 0 && x < dims.width && y >= 0 && y < dims.height) setCellOnLayer(L[2], x, y, '#00E5FF');
        }
      }

      // focal core on 30_Focal
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          if (dx * dx + dy * dy <= 10) setCellOnLayer(L[3], centerX + dx, centerY + dy, '#FFFFFF');
        }
      }
    }

    // 5. Apply SDF Shape (new PDR AMP) on structure layer for clean silhouette
    if (editor.applyAMP) editor.applyAMP('sdf-shape', { layerIndex: 1, createNewLayer: true, color: '#B8860B' });

    // 6. Apply Noise Fill (new PDR AMP) on energy/focal for variation
    if (editor.applyAMP) editor.applyAMP('noise-fill', { layerIndex: 2, createNewLayer: true });

    // 7. Polish pass (re-uses existing sharpness as in user recipe)
    if (editor.applyAMP) editor.applyAMP('square-sharpness-contrast', { layerIndex: 4, intensity: 0.75 });

    // sync document model for panels + force redraw so everything (layers, palette, history) updates
    if (editor.forceRedraw) editor.forceRedraw();
    if (editor.getLayers) {
      const vis = editor.getLayers();
      setCurrentDocument(prev => ({
        ...(prev || { width: dims.width, height: dims.height, cellSize: 1 }),
        layers: vis.map(v => ({ ...v, cells: v.cells instanceof Map ? new Map(v.cells) : v.cells }))
      }));
    }

    setPageNotice('Created Eclipse Ward Pauldron via PixelBrain (SDF + Noise + lattice + full recipe provenance). Command history has the steps - use EXPORT RECIPE (Forge Spec) for the machine-readable packet.');
  };

  // Critique runs against the live canvas grid inside the mentor panel.
  const triggerCritique = () => {
    setShowPixelBrainPanel(true);
    setCritiqueToken(t => t + 1);
  };

  // Void Shield Drill - timed + guided. Ends with an automatic mentor critique
  // (the critique IS the feedback; there is no separate numeric score).
  const startVoidShieldDrill = () => {
    applyConstructionGuides(); // load the drill guides onto the canvas

    setIsDrillActive(true);
    setDrillSecondsLeft(20 * 60); // 20 minute drill as per Library
    setPageNotice(null);

    if (drillTimerRef.current) clearInterval(drillTimerRef.current);

    drillTimerRef.current = setInterval(() => {
      setDrillSecondsLeft(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(drillTimerRef.current);
          setIsDrillActive(false);
          setTimeout(() => {
            setShowPixelBrainPanel(true);
            setCritiqueToken(t => t + 1);
            setPageNotice('DRILL COMPLETE - the mentor has critiqued the result. Findings are in the PixelBrain panel.');
          }, 100);
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const formatDrillTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Deterministic recipe / Forge Spec export (machine-readable full provenance for item-foundry)
  const exportDeterministicRecipe = () => {
    const editor = editorRef.current;
    if (!editor) {
      setPageNotice('Editor not ready for recipe export');
      return;
    }

    const history = (typeof editor.getCommandHistory === 'function' ? editor.getCommandHistory() : []) || [];
    const dims = editor.getGridDimensions ? editor.getGridDimensions() : { width: 64, height: 80 };
    const layers = editor.getLayers ? editor.getLayers() : [];
    const grid = editor.getGrid ? editor.getGrid() : null;

    const recipe = {
      version: 'pixelbrain.recipe.v1',
      createdAt: new Date().toISOString(),
      dims,
      palette: [...customPalette],
      symmetry: grid?.symmetryAxes || [],
      layers: layers.map((l, i) => ({
        index: i,
        name: l.name,
        visible: !!l.visible,
        locked: !!l.locked,
        opacity: l.opacity,
        cellCount: l.cells ? (l.cells.size || (Array.isArray(l.cells) ? l.cells.length : 0)) : 0,
      })),
      commands: history.map(h => ({
        description: h.description,
        ampId: h.ampId,
        options: h.options,
        layerIndex: h.layerIndex,
        timestamp: h.timestamp,
      })),
      note: 'Replay the commands in order on a fresh grid with the same palette + construction to reproduce exactly.',
    };

    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixelbrain-recipe-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Forge Craft Gate - runs an ITEM-SPEC-v1 through the PixelBrain Immunity gate
  // via the adapter (no direct codex import). Returns the normalized verdict to
  // the panel, which renders the bytecode-grade PASS/FAIL in-world.
  const handleRunForgeGate = useCallback((spec) => {
    const verdict = runForgeCraftGate(spec);
    setShowForgeGatePanel(true);
    setPageNotice(
      verdict.ok
        ? `FORGE GATE PASSED - ${verdict.vaccine}`
        : `FORGE GATE BLOCKED - ${verdict.bytecode || ''} ${verdict.reason || ''}`.trim()
    );
    return verdict;
  }, []);

  // Silhouette Blueprint Gate - grades the forged solid's three shadows (and any
  // animation poses) against a sealed .silh via the adapter. Returns the normalized
  // verdict (with the offending view/phase on a FAIL) to the panel for its chip row.
  const handleRunForgeGateWithBlueprint = useCallback((spec, silhText) => {
    const verdict = runForgeCraftGateWithBlueprint(spec, silhText);
    setShowForgeGatePanel(true);
    setPageNotice(
      verdict.ok
        ? `BLUEPRINT SEALED - ${verdict.vaccine}`
        : `BLUEPRINT BLOCKED - ${verdict.bytecode || ''} ${verdict.reason || ''}${
            verdict.view ? ` (${verdict.view}${verdict.phase ? `/${verdict.phase}` : ''})` : ''
          }`.trim()
    );
    return verdict;
  }, []);

  // Exports of the live canvas, via the editor's own (tested) export paths.
  const handleRealExport = (format) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (format === 'ase') editor.exportAse?.();
    else if (format === 'png') editor.exportPng?.();
  };

  // === AMP post-processing (runs on the live canvas grid) ===
  // Optionally duplicates the active layer first so the AMP lands on a copy.
  const handleApplyAMP = (ampId, options = {}, createNewLayer = false) => {
    const editor = editorRef.current;
    if (!editor || !editor.applyAMP) return { description: 'editor not ready' };
    const res = editor.applyAMP(ampId, { ...options, layerIndex: rightActiveLayer, createNewLayer });
    // Auto sync document after real AMP so right panels (mentor, layers) reflect the visual immediately (dual-model improvement)
    if (editor.getLayers) {
      const visual = editor.getLayers();
      setCurrentDocument(prev => {
        if (!prev?.layers) return prev;
        const synced = prev.layers.map((l, i) => {
          const v = visual[i] || {};
          return {
            ...l,
            visible: v.visible ?? l.visible,
            locked: v.locked ?? l.locked,
            opacity: typeof v.opacity === 'number' ? v.opacity : l.opacity,
            cells: v.cells ? (v.cells instanceof Map ? new Map(v.cells) : v.cells) : l.cells,
          };
        });
        return { ...prev, layers: synced };
      });
    }
    return res || { description: 'AMP applied' };
  };

  const handlePreviewAMP = (ampId, options = {}, createNewLayer = false) => {
    const editor = editorRef.current;
    if (!editor || !editor.previewAMP) return handleApplyAMP(ampId, options, createNewLayer);
    const res = editor.previewAMP(ampId, { ...options, layerIndex: rightActiveLayer, createNewLayer });
    setIsAMPPreviewing(true);
    // sync preview result
    if (editor.getLayers) {
      const visual = editor.getLayers();
      setCurrentDocument(prev => {
        if (!prev?.layers) return prev;
        const synced = prev.layers.map((l, i) => {
          const v = visual[i] || {};
          return { ...l, visible: v.visible ?? l.visible, locked: v.locked ?? l.locked, opacity: typeof v.opacity === 'number' ? v.opacity : l.opacity, cells: v.cells ? (v.cells instanceof Map ? new Map(v.cells) : v.cells) : l.cells };
        });
        return { ...prev, layers: synced };
      });
    }
    return { ...(res || {}), isPreview: true };
  };

  const commitAMPPreview = () => {
    const editor = editorRef.current;
    if (editor?.commitPreview) editor.commitPreview();
    setIsAMPPreviewing(false);
  };

  const discardAMPPreview = () => {
    const editor = editorRef.current;
    if (editor?.discardPreview) editor.discardPreview();
    setIsAMPPreviewing(false);
  };

  // === Semantic image import for reference layers ===
  // Uses generatePixelArtFromImage + analyzeImageToFormula with a raw raster fallback.
  const handleUploadForReference = async (file) => {
    if (!file) return { analysis: {}, quantizedCells: [] };
    try {
      let analysis = {};
      if (analyzeImageToFormula) {
        try { analysis = analyzeImageToFormula(file) || analyzeImageToFormula({ name: file.name }) || {}; } catch (e) { /* non-fatal */ }
      }
      let quantizedCells = [];
      if (generatePixelArtFromImage) {
        try {
          const res = generatePixelArtFromImage(file) || generatePixelArtFromImage({ file });
          quantizedCells = res?.coordinates || res?.cells || res?.quantizedCells || [];
        } catch (e) { /* non-fatal, will use raster fallback */ }
      }

      // Fallback raster sample so the flow is always usable (and reference layer gets created)
      if (!quantizedCells || quantizedCells.length === 0) {
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
        const dims = editorRef.current?.getGridDimensions?.() || { width: 64, height: 80 };
        const w = dims.width, h = dims.height;
        const temp = document.createElement('canvas');
        temp.width = w; temp.height = h;
        const tctx = temp.getContext('2d', { willReadFrequently: true });
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(img, 0, 0, w, h);
        const idata = tctx.getImageData(0, 0, w, h);
        const data = idata.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] > 10) {
              const hex = '#' + [data[i], data[i+1], data[i+2]].map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase();
              quantizedCells.push({ x, y, color: hex });
            }
          }
        }
      }

      return { analysis, quantizedCells };
    } catch (e) {
      console.warn('semantic reference import partial (calls were attempted)', e);
      return { analysis: { source: file.name }, quantizedCells: [] };
    }
  };

  // ReferencePanel hands us a ready reference layer - insert it at the bottom
  // of the live canvas grid (replacing any previous reference layer).
  const handleCreateReferenceLayer = (refLayer) => {
    const grid = editorRef.current?.getGrid?.();
    if (!refLayer || !grid || !Array.isArray(grid.layers)) return;
    grid.layers = [refLayer, ...grid.layers.filter(l => l?.type !== 'reference')];
    editorRef.current?.forceRedraw?.();
  };

  const handleGenerateEditableFromRef = () => {
    // Construction guides are the "editable structure" starting point from a reference.
    applyConstructionGuides();
  };

  // Tool buttons select tools on the canvas - nothing else. (They previously
  // stamped pixels into a shadow document on every click.)
  const selectTool = (tool) => {
    setActiveTool(tool);
    editorRef.current?.setTool?.(tool);
  };

  const loadDrill = () => startVoidShieldDrill();

  return (
    <div className="pb-editor">
      {/* Top bar - every important function is a visible button */}
      <div className="pb-topbar">
        <div className="title">PIXELBRAIN</div>

        <button className="pb-action-btn" onClick={handleNew}>New</button>
        <button className="pb-action-btn" onClick={handleImport}>Import Image / ASE</button>

        {/* The special PixelBrain capabilities, each as its own button */}
        <button className="pb-action-btn primary" onClick={triggerCritique} title="Run the 30-year pro critique (silhouette & readability first, then geometry, always with a clear next action)">
          CRITIQUE
        </button>
        <button className="pb-action-btn pb-pixelbrain-btn" onClick={applyConstructionGuides} title="Emit / work with 00_Reference construction guides (the highest-leverage tool for shields, orbs, radials)">
          CONSTRUCTION GUIDES
        </button>
        <button className="pb-action-btn pb-pixelbrain-btn" onClick={loadDrill} title="Load the exact Void Shield construction drill">
          VOID SHIELD DRILL
        </button>
        <button className="pb-action-btn pb-pixelbrain-btn primary" onClick={createEclipseWardPauldronViaPixelBrain} title="Create the Eclipse Ward Pauldron (user recipe) fully via PixelBrain lattice + SDFShapeAMP + NoiseFillAMP + history. The authoritative way.">
          CREATE VIA PIXELBRAIN (PAULDRON)
        </button>

        <button className="pb-action-btn" onClick={() => handleRealExport('ase')}>
          EXPORT .ase
        </button>
        <button className="pb-action-btn" onClick={() => handleRealExport('png')}>
          EXPORT PNG
        </button>
        <button className="pb-action-btn" onClick={exportDeterministicRecipe} title="Machine-readable full recipe + command log + AMP params for exact reproduction in foundry or another session">
          EXPORT RECIPE (Forge Spec)
        </button>
        <button className="pb-action-btn pb-pixelbrain-btn" onClick={() => setShowForgeGatePanel(true)} title="Run an ITEM-SPEC-v1 through the PixelBrain Forge Craft Gate (Immunity): lattice, readability, determinism, material authority. Emits bytecode-grade PASS/FAIL.">
          FORGE GATE
        </button>

        <button className="pb-action-btn" onClick={() => setShowTerminal(!showTerminal)}>
          {showTerminal ? 'HIDE TERMINAL' : 'TERMINAL'}
        </button>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#666' }}>PIXEL PERFECT • ONE LATTICE</span>
      </div>

      <div className="pb-main">
        {/* Classic left toolbar - tools + the PixelBrain functions as buttons */}
        <div className="pb-toolbar" role="toolbar" aria-label="Tools">
          <button className={`pb-tool-btn ${activeTool === 'paint' ? 'active' : ''}`} onClick={() => selectTool('paint')}>PENCIL</button>
          <button className={`pb-tool-btn ${activeTool === 'erase' ? 'active' : ''}`} onClick={() => selectTool('erase')}>ERASER</button>
          <button className={`pb-tool-btn ${activeTool === 'fill' ? 'active' : ''}`} onClick={() => selectTool('fill')}>FILL</button>

          <div style={{ height: 8 }} />

          {/* The "functions we invented" also live here as prominent buttons */}
          <button className="pb-tool-btn pb-pixelbrain-btn" onClick={triggerCritique}>CRITIQUE</button>
          <button className="pb-tool-btn pb-pixelbrain-btn" onClick={applyConstructionGuides}>CNSTR</button>
          <button className="pb-tool-btn pb-pixelbrain-btn" onClick={loadDrill}>DRILL</button>
          <button className="pb-tool-btn pb-pixelbrain-btn primary" onClick={createEclipseWardPauldronViaPixelBrain} title="Via PixelBrain (SDF+Noise)">PAULDRON</button>
        </div>

        {/* THE CANVAS - this is the entire point of the page */}
        <div className="pb-canvas-area">
          <div className="pb-canvas-viewport">
            <div className="pb-canvas-frame">
              {/* Aseprite-like document "window" - the canvas should feel large and spacious */}
              <div className="pb-canvas-document-header">
                {activeAssetPacket?.source?.label || activeAssetPacket?.id || 'untitled'} - {canvasGrid?.width || 64}×{canvasGrid?.height || 80}
                {isDrillActive && <span style={{ color: '#f66', marginLeft: 8 }}>DRILL {formatDrillTime(drillSecondsLeft)}</span>}
                <span className="pb-canvas-doc-dirty">•</span>
              </div>
              <Suspense fallback={<div style={{ padding: 40, color: '#555', textAlign: 'center' }}>Loading pixel editor...</div>}>
                <TemplateEditor
                  ref={editorRef}
                  key={`editor-${editorInstanceKey}`}
                  initialAssetPacket={activeAssetPacket}
                  onGridChange={handleGridChange}
                />
              </Suspense>
            </div>
          </div>

          <div className="pb-statusbar">
            <span>TOOL: {activeTool.toUpperCase()}</span>
            <span>Direct pixel canvas • Construction before ink • Critique before polish</span>
            <span style={{ marginLeft: 'auto', color: pageNotice ? '#fc4' : '#555' }} aria-live="polite">
              {pageNotice || 'All PixelBrain tools are the buttons above and on the left'}
            </span>
          </div>

          {/* Custom palette box - top right, user editable hex colors, max 12 */}
          <div className="custom-palette-box">
            <div className="header">
              <span>CUSTOM PALETTE</span>
              <span style={{color: '#666'}}>{customPalette.length}/12</span>
            </div>

            {customPalette.map((color, index) => (
              <div key={index} className="color-row">
                <div
                  className="swatch"
                  role="button"
                  tabIndex={0}
                  style={{ backgroundColor: color }}
                  onClick={() => setBrushFromPalette(color)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBrushFromPalette(color); } }}
                  title="Click or press Enter/Space to set brush color"
                  aria-label={`Palette color ${color}`}
                />
                <input
                  className="hex"
                  type="text"
                  value={color}
                  onChange={(e) => updateCustomColor(index, e.target.value)}
                  maxLength={7}
                  placeholder="#RRGGBB"
                />
                <button
                  className="remove"
                  onClick={() => removeCustomColor(index)}
                  title="Remove color"
                >
                  ×
                </button>
              </div>
            ))}

            {customPalette.length < 12 && (
              <button className="add-btn" onClick={addCustomColor}>
                + ADD COLOR (up to 12)
              </button>
            )}
          </div>
        </div>

        {/* Right side - supporting panels, all reading the live canvas grid */}
        <div className="pb-right-panels">
          {showPixelBrainPanel && (
            <div className="pb-panel">
              <div className="pb-panel-header">
                PIXELBRAIN <button onClick={() => setShowPixelBrainPanel(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>×</button>
              </div>
              <div className="pb-panel-body">
                <button className="pb-action-btn primary" style={{ width: '100%', marginBottom: 4 }} onClick={triggerCritique}>Critique Piece</button>
                <button className="pb-action-btn pb-pixelbrain-btn" style={{ width: '100%', marginBottom: 4 }} onClick={applyConstructionGuides}>Construction Guides</button>
                <button className="pb-action-btn pb-pixelbrain-btn" style={{ width: '100%', marginBottom: 4 }} onClick={loadDrill}>Void Shield Drill</button>

                <div style={{ marginTop: 8 }}>
                  <MentorCritiquePanel
                    grid={canvasGrid}
                    analysis={null}
                    critiqueToken={critiqueToken}
                    drillActive={isDrillActive}
                    drillSecondsLeft={drillSecondsLeft}
                    onApplySuggestion={(type) => {
                      if (type === 'construction' || type === 'symmetry') {
                        applyConstructionGuides();
                      }
                    }}
                    onLoadDrill={loadDrill}
                  />
                </div>
              </div>
            </div>
          )}

          {showLayersPanel && (
            <div className="pb-panel" style={{ flex: 1, minHeight: 130 }}>
              <div className="pb-panel-header">
                LAYERS <button onClick={() => setShowLayersPanel(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>×</button>
              </div>
              <div className="pb-panel-body">
                <LayerStackPanel
                  grid={canvasGrid}
                  activeLayerIndex={rightActiveLayer}
                  onGridUpdate={() => {
                    // The panel mutates the live grid in place; a redraw
                    // re-renders the canvas and re-broadcasts the grid.
                    editorRef.current?.forceRedraw?.();
                  }}
                  onActiveLayerChange={(idx) => {
                    setRightActiveLayer(idx);
                    if (editorRef.current?.setActiveLayer) {
                      editorRef.current.setActiveLayer(idx);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {showPalettePanel && (
            <div className="pb-panel">
              <div className="pb-panel-header">
                PALETTE <button onClick={() => setShowPalettePanel(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>×</button>
              </div>
              <div className="pb-panel-body">
                <IndexedPalettePanel
                  packet={(() => {
                    // Exact palette of whatever asset is actually loaded:
                    // prefer the live grid's imported palette, fall back to
                    // scanning the active packet (max 7 colors).
                    let pal = Array.isArray(canvasGrid?.palette) ? canvasGrid.palette.slice(0, 7) : [];
                    if (pal.length === 0) {
                      const cols = new Set();
                      const coords = activeAssetPacket?.geometry?.coordinates || [];
                      for (const c of coords) {
                        if (typeof c.color === 'string') {
                          cols.add(c.color);
                          if (cols.size >= 7) break; // hard cap at 7
                        }
                      }
                      pal = Array.from(cols);
                    }
                    return { palette: { materialPalette: pal.length ? pal : ['#C9A227', '#00E5FF', '#4A90D9'] } };
                  })()}
                  fgColor="#C9A227"
                  bgColor="#111"
                  onColorPick={(color) => setBrushFromPalette(color)}
                  intensityRatings={{}}
                />
              </div>
            </div>
          )}

          {/* AMP post-processing panel - applies adapter AMPs to the live canvas grid */}
          {showAmpPanel && (
            <div className="pb-panel" style={{ flex: '0 0 auto' }}>
              <div className="pb-panel-header">
                AMP FILTERS <button onClick={() => setShowAmpPanel(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>×</button>
              </div>
              <div className="pb-panel-body" style={{ padding: 0 }}>
                <AMPApplyPanel
                  grid={canvasGrid}
                  activeLayerIndex={rightActiveLayer}
                  onApplyAMP={handleApplyAMP}
                  onPreviewAMP={handlePreviewAMP}
                  isPreviewing={isAMPPreviewing}
                  onCommitPreview={commitAMPPreview}
                  onDiscardPreview={discardAMPPreview}
                />

                {/* Visible, scrubbable command history (addresses "full command history only in the ref") */}
                {editorRef.current?.getCommandHistory && (
                  <div style={{ borderTop: '1px solid #444', padding: '4px 6px', fontSize: 9, maxHeight: 90, overflow: 'auto', background: '#111' }}>
                    <div style={{ color: '#888', marginBottom: 2 }}>COMMAND HISTORY (click to scrub)</div>
                    {(editorRef.current.getCommandHistory() || []).slice(-8).reverse().map((entry, i) => (
                      <button
                        key={entry.id || i}
                        type="button"
                        onClick={() => editorRef.current?.jumpToCommand && editorRef.current.jumpToCommand(entry.index)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          background: entry.isPreview ? 'rgba(255,200,0,0.15)' : 'transparent',
                          color: entry.isPreview ? '#ff8' : '#ccc',
                          border: 'none',
                          padding: '1px 4px',
                          font: 'inherit',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={entry.description}
                      >
                        {entry.description} {entry.isPreview ? '(preview)' : ''}
                      </button>
                    ))}
                    {!(editorRef.current.getCommandHistory() || []).length && <div style={{ color: '#555' }}>No commands yet</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reference / semantic image import panel - adds reference layers to the live canvas */}
          {showRefPanel && (
            <div className="pb-panel" style={{ flex: '0 0 auto' }}>
              <div className="pb-panel-header">
                REFERENCE LAYERS <button onClick={() => setShowRefPanel(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>×</button>
              </div>
              <div className="pb-panel-body" style={{ padding: 0 }}>
                <ReferencePanel
                  onUploadImage={handleUploadForReference}
                  onCreateReferenceLayer={handleCreateReferenceLayer}
                  onGenerateEditableLayers={handleGenerateEditableFromRef}
                />
              </div>
            </div>
          )}

          {/* Forge Craft Gate - Immunity verdict surface for ITEM-SPEC-v1 assets */}
          {showForgeGatePanel && (
            <div className="pb-panel" style={{ flex: '0 0 auto' }}>
              <div className="pb-panel-header">
                FORGE GATE <button onClick={() => setShowForgeGatePanel(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>×</button>
              </div>
              <div className="pb-panel-body">
                <ForgeGatePanel onRunGate={handleRunForgeGate} onRunBlueprint={handleRunForgeGateWithBlueprint} />
              </div>
            </div>
          )}

          <div style={{ padding: 6 }}>
            {!showPixelBrainPanel && (
              <button className="pb-action-btn" style={{ width: '100%' }} onClick={() => setShowPixelBrainPanel(true)}>
                Show PixelBrain Tools
              </button>
            )}
            {!showForgeGatePanel && (
              <button className="pb-action-btn" style={{ width: '100%', marginTop: 4 }} onClick={() => setShowForgeGatePanel(true)}>
                SHOW FORGE GATE (immunity)
              </button>
            )}
            {!showAmpPanel && (
              <button className="pb-action-btn" style={{ width: '100%', marginTop: 4 }} onClick={() => setShowAmpPanel(true)}>
                SHOW AMP (post-process)
              </button>
            )}
            {!showRefPanel && (
              <button className="pb-action-btn" style={{ width: '100%', marginTop: 4 }} onClick={() => setShowRefPanel(true)}>
                SHOW REFERENCE (semantic import)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Keep the old terminal for power users */}
      <AnimatePresence>
        {showTerminal && (
          <motion.div className="terminal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PixelBrainTerminal
              mode="input"
              analysisResult={null}
              onClose={() => setShowTerminal(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
