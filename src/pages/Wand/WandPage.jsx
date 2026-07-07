/**
 * SCHOLOMANCE FAIRLY ODD WAND - INTERACTIVE UX TEST-DRIVE
 * 
 * Path: `src/pages/Wand/WandPage.jsx`
 * Description: High-fidelity mathematical authoring studio with real-time coordinate
 *              evaluation, role-dispatched rendering, and robust fail-closed validation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Terminal,
  Save,
  ShieldAlert,
  RefreshCw,
  FileCode,
  AlertTriangle,
  Layers,
  Sliders,
  Plus,
  Trash2,
  FolderOpen,
  Download,
} from 'lucide-react';

// Core engine imports
import {
  validateProposal,
  evaluateFormula,
  snapToPixelGrid,
  resolvePixelGridSize,
  initializeTurboQuant,
  quantizeFlatCoordinates
} from '../../lib/engine.adapter.js';
import { generateCatalogId } from '../../lib/catalogId.js';
import { roleDispatcher } from '../../ui/features/mysticHolistics/hero/roleDispatcher';
import { registerBuiltInDrawers } from '../../ui/features/mysticHolistics/hero/roleDrawers';
import { useGodotExportFlag } from '../../hooks/useGodotExportFlag.js';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { downloadTextFile } from '../../components/GodotExportButton/downloadTextFile.js';
import { buildWandGodotExport } from '../../lib/godot-export/wandGodotExport.js';
import { routeRetinaPacketToPhotonicBridge } from '../../lib/photonic-retina/index.js';
import { deriveWandFillBytecode } from '../../lib/pixelbrain.adapter.js';
import { publishWandFill } from '../../lib/wandPixelbrainBridge.js';

import './WandPage.css';

// ── INITIAL PRESETS ──────────────────────────────────────────────────────────

const INITIAL_PRESETS = [
  {
    id: "preset-moon",
    name: "Celestial Lunar Sigil",
    description: "Concentric golden moon orbits using a parametric curve",
    proposal: {
      rationale: "Establish stellar anchoring sigil for high-acuity dream magic.",
      confidence: 0.95,
      reviewRequired: false,
      sourceIntentHash: "lunar-sigil-core",
      evalSuiteId: "suite-celestial",
      proposedFormula: {
        role: "shrine.moon",
        material: "gold",
        paletteChannel: 0,
        formula: {
          type: "parametric_curve",
          parameters: {
            cx: 400,
            cy: 300,
            a: 120,
            b: 0.1,
            c: 0,
            n: 256
          }
        }
      }
    }
  },
  {
    id: "preset-altar",
    name: "Alchemist's Foundation",
    description: "Monolithic stone altar base coordinates",
    proposal: {
      rationale: "Provide structural foundation coords for alchemical transmutation rituals.",
      confidence: 0.9,
      reviewRequired: false,
      sourceIntentHash: "altar-base-primary",
      evalSuiteId: "suite-alchemy",
      proposedFormula: {
        role: "shrine.altar",
        material: "stone",
        paletteChannel: 2,
        formula: {
          type: "grid_projection",
          gridType: "rectangular",
          cellSize: 16,
          snapStrength: 0.8,
          gridWidth: 320,
          gridHeight: 80
        }
      }
    }
  },
  {
    id: "preset-fibonacci",
    name: "Fibonacci Spiral Grid",
    description: "Golden subdivision ratios manifesting natural geometry",
    proposal: {
      rationale: "Unleash golden ratio spiral grid projection for organic growth visuals.",
      confidence: 0.99,
      reviewRequired: false,
      sourceIntentHash: "golden-spiral-ratio",
      evalSuiteId: "suite-fibonacci",
      proposedFormula: {
        role: "sigil.capsule",
        material: "aurora",
        paletteChannel: 1,
        formula: {
          type: "fibonacci",
          iterations: 8,
          scale: 0.75
        }
      }
    }
  },
  {
    id: "preset-fractal",
    name: "Sierpinski Sigil Arc",
    description: "Recursive geometric subdivisions utilizing fractal points",
    proposal: {
      rationale: "Embed fractal subdivisions for high-dimensional field constraints.",
      confidence: 0.92,
      reviewRequired: false,
      sourceIntentHash: "fractal-sierpinski-arc",
      evalSuiteId: "suite-fractals",
      proposedFormula: {
        role: "sigil.capsule",
        material: "aurora",
        paletteChannel: 1,
        formula: {
          type: "fractal_iter",
          iterations: 4,
          baseShape: "triangle",
          scale: 45,
          cx: 400,
          cy: 300
        }
      }
    }
  },
  {
    id: "preset-composite-cathedral",
    name: "Cathedral Ritual Chamber",
    description: "Gothic composite combining Moon, Windows, and Altar",
    proposal: {
      rationale: "Synthesize full temple architecture using modular children formulas.",
      confidence: 0.96,
      reviewRequired: false,
      sourceIntentHash: "temple-chamber-alpha",
      evalSuiteId: "suite-cathedral",
      proposedFormula: {
        role: "shrine.window",
        material: "gold",
        paletteChannel: 0,
        formula: {
          type: "composite",
          children: [
            {
              role: "shrine.window",
              anchor: { x: 0.5, y: 0.4 },
              size: { w: 0.7, h: 0.6 },
              material: "aura",
              paletteChannel: 0,
              formula: {
                type: "parametric_curve",
                parameters: { cx: 400, cy: 200, a: 150, b: 0.05, c: 0, n: 120 }
              }
            },
            {
              role: "shrine.moon",
              anchor: { x: 0.5, y: 0.35 },
              size: { w: 0.2, h: 0.2 },
              material: "gold",
              paletteChannel: 1,
              formula: {
                type: "parametric_curve",
                parameters: { cx: 400, cy: 180, a: 60, b: 0.1, c: 0, n: 64 }
              }
            },
            {
              role: "shrine.altar",
              anchor: { x: 0.5, y: 0.75 },
              size: { w: 0.6, h: 0.15 },
              material: "stone",
              paletteChannel: 2,
              formula: {
                type: "grid_projection",
                gridType: "rectangular",
                cellSize: 12,
                snapStrength: 1,
                gridWidth: 280,
                gridHeight: 50
              }
            }
          ]
        }
      }
    }
  },
  {
    id: "preset-arcane-text",
    name: "Arcane Vector Glyph",
    description: "Vector Neon Ink spelling alchemical spell runes",
    proposal: {
      rationale: "Synthesize high-acuity vector neon spell letters centered around sanctuary chamber.",
      confidence: 0.98,
      reviewRequired: false,
      sourceIntentHash: "arcane-vector-rune-core",
      evalSuiteId: "suite-text",
      proposedFormula: {
        role: "text.vector",
        material: "aurora",
        paletteChannel: 0,
        formula: {
          type: "vectorized_text",
          text: "ARCANE 404",
          fontSize: 32,
          cx: 400,
          cy: 300,
          spacing: 1.1
        }
      }
    }
  },
  {
    id: "preset-ballpoint-script",
    name: "Ballpoint Script",
    description: "Hand-drawn anime heavy outline - vectorized text in cream ballpoint ink",
    proposal: {
      rationale: "Render scholastic inscription as thick hand-drawn ink strokes on dark parchment.",
      confidence: 0.97,
      reviewRequired: false,
      sourceIntentHash: "ballpoint-script-v1",
      evalSuiteId: "suite-ink",
      proposedFormula: {
        role: "ink.ballpoint",
        material: "aura",
        paletteChannel: 0,
        formula: {
          type: "vectorized_text",
          text: "SCHOLOMANCE",
          fontSize: 52,
          cx: 400,
          cy: 300,
          spacing: 1.15
        }
      }
    }
  }
];

const REGISTERED_DRAWER_ROLES = ["shrine.window", "shrine.moon", "shrine.cabinet", "shrine.altar", "sigil.capsule", "text.vector", "ink.ballpoint"];

export default function WandPage() {
  const isGodotExportEnabled = useGodotExportFlag();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [proposal, setProposal] = useState(INITIAL_PRESETS[0].proposal);
  const [rawJsonText, setRawJsonText] = useState(JSON.stringify(INITIAL_PRESETS[0].proposal, null, 2));
  const [customPresets, setCustomPresets] = useState([]);
  const [activeTab, setActiveTab] = useState('preset'); // 'preset' | 'params' | 'json'
  
  // Real-time evaluated outputs
  const [coordinates, setCoordinates] = useState([]);
  const [validationResult, setValidationResult] = useState({ valid: true, ok: true, errors: [] });
  const [diagnostics, setDiagnostics] = useState([]);
  const [metrics, setMetrics] = useState({ pointCount: 0, overflowed: false });
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [quantStats, setQuantStats] = useState(null);
  const [photonicRoute, setPhotonicRoute] = useState(null);

  // Animation time
  const [time, setTime] = useState(0);
  const [isAnimating, setIsAnimating] = useState(() => !prefersReducedMotion);

  // Honor reduced-motion: never auto-run the temporal-shift loop when the user
  // has asked the OS to minimize motion (LAW: usePrefersReducedMotion gates motion).
  useEffect(() => {
    if (prefersReducedMotion) setIsAnimating(false);
  }, [prefersReducedMotion]);

  // References
  const canvasRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const quantThrottleRef = useRef(0);

  // ── TERMINAL LOGGER ──────────────────────────────────────────────────────────
  const addTerminalLog = useCallback((message, severity = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [
      { timestamp, message, severity },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  }, []);

  // ── LOAD CUSTOM PRESETS ──────────────────────────────────────────────────────
  useEffect(() => {
    registerBuiltInDrawers();
    addTerminalLog("Wand System initialized. All scholastic drawers active.", "success");

    initializeTurboQuant()
      .then(() => addTerminalLog("TurboQuant gateway active. Quantization engine online.", "success"))
      .catch(err => {
        console.error(err);
        addTerminalLog(`TurboQuant init error: ${err.message}`, "error");
      });

    const saved = localStorage.getItem('scholomance_wand_presets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomPresets(parsed);
          addTerminalLog(`Loaded ${parsed.length} custom presets from internal library.`, "info");
        }
      } catch (e) {
        console.error("Failed to parse custom presets", e);
      }
    }
  }, [addTerminalLog]);

  // ── TURBOQUANT REACTIVE QUANTIZER & PHOTONIC ROUTE ──────────────────────────
  useEffect(() => {
    if (coordinates.length === 0) {
      setQuantStats(null);
      setPhotonicRoute(null);
      return;
    }

    // Throttle (not reset-on-every-change): while the temporal-shift loop is
    // running, `coordinates` is replaced ~60×/s. A plain debounce would clear
    // its timer every frame and never fire, so the telemetry panels stayed dead
    // during animation. Cap to one recompute per ~250ms instead.
    const elapsed = Date.now() - quantThrottleRef.current;
    const delay = Math.max(0, 250 - elapsed);

    const timer = setTimeout(() => {
      quantThrottleRef.current = Date.now();
      const targetCoords = coordinates.filter(c => c.role === 'text.vector' || c.role === 'ink.ballpoint');
      if (targetCoords.length === 0) {
        setQuantStats(null);
      } else {
        const flatArray = [];
        targetCoords.forEach(c => {
          flatArray.push(c.x, c.y);
        });

        quantizeFlatCoordinates(flatArray)
          .then(stats => {
            setQuantStats(stats);
          })
          .catch(err => {
            console.error("Quantization error:", err);
          });
      }

      // Route all coordinates through Photonic Bridge
      try {
        const retinaInput = {
          sourceKind: 'coordinates',
          payload: coordinates.map(c => ({
            x: Number(c.x ?? 0),
            y: Number(c.y ?? 0),
            color: c.color || '#d4af37',
            emphasis: Number(c.emphasis ?? c.pressure ?? 1.0)
          })),
          dimensions: { width: 800, height: 600 }
        };

        const route = routeRetinaPacketToPhotonicBridge(retinaInput, {
          retina: {
            targetDimension: 64,
            bitWidth: 4,
          },
          bridge: {
            mode: 'shadow'
          }
        });
        setPhotonicRoute(route);
      } catch (err) {
        console.error("Photonic Bridge routing error:", err);
        setPhotonicRoute(null);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [coordinates]);

  // ── DETECT CHANGES AND RUN DEBOUNCED ENGINE ──────────────────────────────────
  // `silent` is used by the animation tick: it re-evaluates geometry for the
  // current (already-validated) proposal without re-running validation, writing
  // diagnostics, or spamming the terminal once per frame.
  const runEvaluation = useCallback((currentProposal, { silent = false } = {}) => {
    // 1. Perform schema/proposal validation (skipped on silent animation ticks).
    if (!silent) {
      const validation = validateProposal(currentProposal);
      setValidationResult(validation);

      if (!validation.valid) {
        setCoordinates([]);
        setMetrics({ pointCount: 0, overflowed: false });

        const logMsg = `Validation failed: ${validation.errors[0]}`;
        const code = validation.bytecodeError?.bytecode || "PB-ERR-UNKNOWN";
        addTerminalLog(`[${code}] ${logMsg}`, "error");

        // Populate diagnostics list
        setDiagnostics([
          {
            type: 'FORMULA_PROPOSAL_REJECTED',
            errors: validation.errors,
            bytecodeError: code,
            proposal: currentProposal
          }
        ]);
        return;
      }

      // 2. Clear diagnostics on a fresh, valid user-driven evaluation.
      setDiagnostics([]);
    }

    try {
      const { proposedFormula } = currentProposal;
      const rawCoords = evaluateProposalCoordinates(proposedFormula, { width: 800, height: 600 }, time);

      const resolvedGridSize = resolvePixelGridSize({
        canvasSize: {
          width: 800,
          height: 600,
          gridSize: proposedFormula.formula.cellSize ?? proposedFormula.formula.parameters?.cellSize ?? 1
        }
      });

      const snapped = snapToPixelGrid(rawCoords, resolvedGridSize);
      const evaluated = snapped.map((coord, idx) => ({
        ...coord,
        rawX: rawCoords[idx]?.x,
        rawY: rawCoords[idx]?.y
      }));

      let overflowed = false;
      let finalCoords = [...evaluated];

      if (finalCoords.length > 2000) {
        overflowed = true;
        finalCoords = finalCoords.slice(0, 2000);
        if (!silent) {
          addTerminalLog(`Warning: Evaluation generated ${rawCoords.length} points, exceeding safety cap of 2000. Clamped.`, "warning");
          setDiagnostics([
            {
              type: 'FORMULA_EVAL_WARN',
              message: `Evaluation generated ${rawCoords.length} points, exceeding 2000 point budget. Preview is truncated.`
            }
          ]);
        }
      }

      setCoordinates(finalCoords);
      setMetrics({
        pointCount: rawCoords.length,
        overflowed
      });

      if (!silent && evaluated.length > 0) {
        const uniqueRoles = Array.from(new Set(finalCoords.map(c => c.role)));
        addTerminalLog(`Successfully evaluated ${finalCoords.length} points across roles: [${uniqueRoles.join(', ')}]`, "success");
      }
    } catch (e) {
      if (!silent) {
        addTerminalLog(`Runtime evaluation error: ${e.message}`, "error");
      }
      setCoordinates([]);
    }
  }, [time, addTerminalLog]);

  // Debounced wrapper
  const triggerDebouncedEvaluation = useCallback((currentProposal) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      runEvaluation(currentProposal);
    }, 150); // 150ms debounce
  }, [runEvaluation]);

  // Synchronize JSON editor and visual state
  const handleProposalChange = useCallback((newProposal, source = 'visual') => {
    setProposal(newProposal);
    if (source === 'visual') {
      setRawJsonText(JSON.stringify(newProposal, null, 2));
    }
    triggerDebouncedEvaluation(newProposal);
  }, [triggerDebouncedEvaluation]);

  const handleJsonTextChange = (text) => {
    setRawJsonText(text);
    try {
      const parsed = JSON.parse(text);
      handleProposalChange(parsed, 'json');
    } catch (e) {
      // Keep JSON text but report parse error to console/terminal without updating proposal state yet
      setValidationResult({
        valid: false,
        ok: false,
        errors: [`Invalid JSON Syntax: ${e.message}`],
        bytecodeError: { bytecode: "PB-ERR-v1-FORMULA-CRIT-IMGFOR-0B03-PARSE" }
      });
    }
  };

  // ── RECURSIVE EVALUATOR ─────────────────────────────────────────────────────
  const evaluateProposalCoordinates = (proposedFormula, canvasSize, t) => {
    const { role, material = 'aura', formula } = proposedFormula;

    if (formula.type === 'composite') {
      const coords = [];
      formula.children.forEach(child => {
        const subWidth = (child.size?.w ?? 1.0) * canvasSize.width;
        const subHeight = (child.size?.h ?? 1.0) * canvasSize.height;
        const childCanvas = { width: subWidth, height: subHeight };

        const rawCoords = evaluateFormula({ coordinateFormula: child.formula }, childCanvas, t);

        const worldAnchorX = child.anchor.x * canvasSize.width;
        const worldAnchorY = child.anchor.y * canvasSize.height;

        const dx = worldAnchorX - subWidth / 2;
        const dy = worldAnchorY - subHeight / 2;

        let angleDeg = child.rotation ?? 0;
        if (child.rotationSpeed) {
          angleDeg += child.rotationSpeed * (t / 1000);
        }
        if (child.rotationSwingRange) {
          const swingSpeed = child.rotationSwingSpeed ?? 1.0;
          angleDeg += Math.sin((t / 1000) * swingSpeed) * child.rotationSwingRange;
        }

        const rotateLocal = angleDeg !== 0;
        const rad = angleDeg * Math.PI / 180;
        const cosVal = Math.cos(rad);
        const sinVal = Math.sin(rad);
        const localCenterX = subWidth / 2;
        const localCenterY = subHeight / 2;

        rawCoords.forEach(c => {
          let px = c.x;
          let py = c.y;

          if (rotateLocal) {
            const rx = px - localCenterX;
            const ry = py - localCenterY;
            px = localCenterX + rx * cosVal - ry * sinVal;
            py = localCenterY + rx * sinVal + ry * cosVal;
          }

          coords.push({
            ...c,
            x: px + dx,
            y: py + dy,
            role: child.role,
            material: child.material || material,
            paletteChannel: child.paletteChannel !== undefined ? child.paletteChannel : proposedFormula.paletteChannel
          });
        });
      });
      return coords;
    } else {
      const rawCoords = evaluateFormula({ coordinateFormula: formula }, canvasSize, t);
      return rawCoords.map(c => ({
        ...c,
        role,
        material,
        paletteChannel: proposedFormula.paletteChannel
      }));
    }
  };

  // ── CANVAS DRAW LOOP ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pull the chamber palette from theme tokens (school-reactive) rather than
    // hardcoding hex in the render logic. Fallbacks preserve the prior look when
    // a token is absent (e.g. SSR / isolated test render).
    const styles = getComputedStyle(canvas);
    const readToken = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    const voidColor = readToken('--bg-void', '#0a0a14');
    const goldColor = readToken('--chrome-gold', '#d4af37');
    const accentColor = readToken('--active-school-color', '') || readToken('--school-psychic', '#00f5ff');

    let localFrame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Render parchment backing / dark chamber ambience
      ctx.fillStyle = voidColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle atmospheric grid (gold anchor, very low alpha)
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = goldColor;
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      ctx.restore();

      // Draw mathematical guides (school accent)
      ctx.save();
      ctx.globalAlpha = 0.03;
      ctx.strokeStyle = accentColor;
      ctx.beginPath();
      ctx.arc(canvas.width/2, canvas.height/2, 200, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Dispatch coordinate roles
      try {
        roleDispatcher.dispatchRoles(ctx, coordinates, { width: canvas.width, height: canvas.height });
      } catch (err) {
        console.error("Role dispatcher failed to draw", err);
      }

      if (isAnimating) {
        setTime(prev => (prev + 16) % 100000);
      }

      localFrame = requestAnimationFrame(draw);
    };

    localFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(localFrame);
  }, [coordinates, isAnimating]);

  // Re-run evaluation when time changes to drive animation smoothly.
  // Silent so the per-frame tick doesn't re-validate or flood the terminal;
  // gated on a currently-valid proposal so we never animate rejected geometry.
  useEffect(() => {
    if (isAnimating && validationResult.valid) {
      runEvaluation(proposal, { silent: true });
    }
  }, [time, isAnimating, validationResult.valid, runEvaluation, proposal]);

  // ── REGISTRY PERSISTENCE (UNKNOWN ROLE GATING) ────────────────────────────────
  const handleSaveToCatalog = () => {
    // 1. Double check validation first
    const validation = validateProposal(proposal);
    if (!validation.valid) {
      addTerminalLog("Cannot persist: current proposal fails structural validation.", "error");
      return;
    }

    const { role, formula } = proposal.proposedFormula;

    // 2. Strict persisted mode unknown-role policy: Reject proposals with unregistered roles
    const rolesToCheck = [];
    if (formula.type === 'composite') {
      formula.children.forEach(child => rolesToCheck.push(child.role));
    } else {
      rolesToCheck.push(role);
    }

    const unregistered = rolesToCheck.filter(r => !REGISTERED_DRAWER_ROLES.includes(r));
    if (unregistered.length > 0) {
      addTerminalLog(`PERSIST REJECTED: Semantic role "${unregistered[0]}" has no registered drawer. Presisted formulas require structural law.`, "error");
      addTerminalLog(`PERSISTENCE BLOCKED: Role "${unregistered[0]}" unregistered. Approved roles: [${REGISTERED_DRAWER_ROLES.join(', ')}]`, "error");
      return;
    }

    // 3. Generate deterministic Catalog ID
    const catId = generateCatalogId(role, formula, proposal.sourceIntentHash);

    // 4. Save to list
    const newEntry = {
      catalogId: catId,
      timestamp: new Date().toISOString(),
      name: `Custom Alchemical - ${catId.substring(4, 9)}`,
      proposal: JSON.parse(JSON.stringify(proposal)) // Deep copy
    };

    const updated = [newEntry, ...customPresets.filter(p => p.catalogId !== catId)];
    setCustomPresets(updated);
    localStorage.setItem('scholomance_wand_presets', JSON.stringify(updated));

    addTerminalLog(`Idempotently registered formula catalog: ${catId}`, "success");
    addTerminalLog(`FORMULA PERSISTED: Catalog ID ${catId} - saved in Local Sanctuary.`, "success");
  };

  const handleGodotArtifactExport = () => {
    try {
      const artifactText = buildWandGodotExport(proposal);
      downloadTextFile(`wand_${proposal.proposedFormula?.role || 'proposal'}_${Date.now()}.wand`, artifactText);
      addTerminalLog('Godot Wand artifact exported.', 'success');
    } catch (err) {
      addTerminalLog(`Godot export failed: ${err.message}`, 'error');
    }
  };

  // Emit a PixelBrain fill bytecode derived from this proposal, for the
  // template/fill pipeline to consume (replaces PixelBrain's manual dropdowns).
  const handleSendToPixelBrain = () => {
    try {
      const pf = proposal?.proposedFormula || {};
      const spec = deriveWandFillBytecode(pf);
      const geometry = coordinates.map((c) => ({
        x: Number(c.snappedX ?? c.x ?? 0),
        y: Number(c.snappedY ?? c.y ?? 0),
      }));
      publishWandFill({
        ...spec,
        role: pf.role,
        material: pf.material,
        coordinates: geometry,
        canvas: { width: 800, height: 600 },
      });
      addTerminalLog(
        `Emitted ${spec.bytecode} + ${geometry.length} geometry points → PixelBrain (from ${spec.source}).`,
        'success',
      );
    } catch (err) {
      addTerminalLog(`PixelBrain handoff failed: ${err.message}`, 'error');
    }
  };

  const handleLoadPreset = (presetProposal, name) => {
    // Deep-copy: presets are module-level constants (and saved catalog entries).
    // Editing must never mutate the source object that every card renders from.
    const draft = JSON.parse(JSON.stringify(presetProposal));
    handleProposalChange(draft, 'visual');
    addTerminalLog(`Loaded preset: "${name}"`, "info");
  };

  const handleDeleteCustomPreset = (catId, e) => {
    e.stopPropagation();
    const updated = customPresets.filter(p => p.catalogId !== catId);
    setCustomPresets(updated);
    localStorage.setItem('scholomance_wand_presets', JSON.stringify(updated));
    addTerminalLog(`Deleted custom preset ${catId}`, "info");
  };

  // ── PARAMETER ADJUSTMENT HELPERS ─────────────────────────────────────────────
  
  const updateLeafParam = (key, value) => {
    const updated = {
      ...proposal,
      proposedFormula: {
        ...proposal.proposedFormula,
        formula: {
          ...proposal.proposedFormula.formula,
          parameters: {
            ...proposal.proposedFormula.formula.parameters,
            [key]: value
          }
        }
      }
    };
    handleProposalChange(updated, 'visual');
  };

  const updateRootField = (key, value) => {
    const updated = {
      ...proposal,
      [key]: value
    };
    handleProposalChange(updated, 'visual');
  };

  const updateProposedFormulaField = (key, value) => {
    const updated = {
      ...proposal,
      proposedFormula: {
        ...proposal.proposedFormula,
        [key]: value
      }
    };
    handleProposalChange(updated, 'visual');
  };

  const setFormulaType = (type) => {
    let baseFormula = { type };
    if (type === 'parametric_curve') {
      baseFormula.parameters = { cx: 400, cy: 300, a: 100, b: 0.1, c: 0, n: 128 };
    } else if (type === 'grid_projection') {
      baseFormula.gridType = 'rectangular';
      baseFormula.cellSize = 12;
      baseFormula.snapStrength = 0.5;
      baseFormula.gridWidth = 200;
      baseFormula.gridHeight = 200;
    } else if (type === 'fibonacci') {
      baseFormula.iterations = 6;
      baseFormula.scale = 1.0;
    } else if (type === 'fractal_iter') {
      baseFormula.iterations = 3;
      baseFormula.baseShape = 'triangle';
      baseFormula.scale = 30;
      baseFormula.cx = 400;
      baseFormula.cy = 300;
    } else if (type === 'composite') {
      baseFormula.children = [
        {
          role: "sigil.capsule",
          anchor: { x: 0.5, y: 0.5 },
          size: { w: 0.4, h: 0.4 },
          formula: {
            type: "parametric_curve",
            parameters: { cx: 400, cy: 300, a: 80, b: 0.1, c: 0, n: 64 }
          }
        }
      ];
    } else if (type === 'vectorized_text') {
      baseFormula.text = "ARCANE 404";
      baseFormula.fontSize = 24;
      baseFormula.cx = 400;
      baseFormula.cy = 300;
      baseFormula.spacing = 1.0;
    }
    
    const updated = {
      ...proposal,
      proposedFormula: {
        ...proposal.proposedFormula,
        formula: baseFormula
      }
    };
    handleProposalChange(updated, 'visual');
  };

  return (
    <div className="wand-workspace">
      {/* HEADER SECTION */}
      <header className="wand-header">
        <div className="header-info">
          <div className="logo-section">
            <Sparkles className="logo-sparkle animate-pulse" />
            <h1>SCHOLOMANCE WAND</h1>
            <span className="version-tag">v1.2 // Bounded Spell Engine</span>
          </div>
          <p className="subtitle">Mathematical formula compiler, coordinates synthesizer, and role dispatcher.</p>
        </div>
        
        <div className="wand-quick-actions">
          <button 
            className={`action-btn animate-btn ${isAnimating ? 'active' : ''}`}
            onClick={() => setIsAnimating(!isAnimating)}
            title={isAnimating ? "Pause temporal shifts" : "Resume temporal shifts"}
          >
            <RefreshCw className={`btn-icon ${isAnimating ? 'spin-icon' : ''}`} />
            {isAnimating ? "Temporal Shift ON" : "Temporal Shift OFF"}
          </button>
          
          <button 
            className="action-btn persist-btn font-bold animate-btn"
            onClick={handleSaveToCatalog}
          >
            <Save className="btn-icon" />
            Persist Catalog
          </button>
          {isGodotExportEnabled && (
            <button
              className="action-btn animate-btn"
              onClick={handleGodotArtifactExport}
              type="button"
              title="Export Godot Wand artifact"
            >
              <Download className="btn-icon" />
              Export Godot
            </button>
          )}
          <button
            className="action-btn animate-btn"
            onClick={handleSendToPixelBrain}
            type="button"
            title="Derive a fill bytecode from this proposal and send it to PixelBrain's template fill"
          >
            <Sparkles className="btn-icon" />
            Send → PixelBrain
          </button>
        </div>
      </header>

      {/* WORKSPACE PANELS */}
      <div className="wand-main-container">
        
        {/* LEFT WORKSPACE PANELS */}
        <section className="wand-control-panel flex-panel" aria-label="Formula controls">
          <div className="panel-tab-bar">
            <button 
              className={`panel-tab ${activeTab === 'preset' ? 'active' : ''}`}
              onClick={() => setActiveTab('preset')}
            >
              <FolderOpen size={14} /> Presets & Catalog
            </button>
            <button 
              className={`panel-tab ${activeTab === 'params' ? 'active' : ''}`}
              onClick={() => setActiveTab('params')}
            >
              <Sliders size={14} /> Spell Architect
            </button>
            <button 
              className={`panel-tab ${activeTab === 'json' ? 'active' : ''}`}
              onClick={() => setActiveTab('json')}
            >
              <FileCode size={14} /> Raw Grimoire (JSON)
            </button>
          </div>

          <div className="tab-viewport">
            
            {/* TAB 1: PRESETS SELECTOR */}
            {activeTab === 'preset' && (
              <div className="preset-selector-tab">
                <h3>SCHOLASTIC PRESETS</h3>
                <div className="preset-grid">
                  {INITIAL_PRESETS.map((p) => (
                    <div
                      key={p.id}
                      className="preset-card animate-btn"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleLoadPreset(p.proposal, p.name)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLoadPreset(p.proposal, p.name); }}
                    >
                      <div className="preset-card-header">
                        <h4>{p.name}</h4>
                        <span className="preset-badge">{p.proposal.proposedFormula.formula.type}</span>
                      </div>
                      <p>{p.description}</p>
                    </div>
                  ))}
                </div>

                {customPresets.length > 0 && (
                  <div className="custom-catalog-section">
                    <h3>SAVED SANCTUARY CATALOGS</h3>
                    <div className="preset-grid">
                      {customPresets.map((p) => (
                        <div
                          key={p.catalogId}
                          className="preset-card custom-preset-card animate-btn"
                          role="button"
                          tabIndex={0}
                          onClick={() => handleLoadPreset(p.proposal, p.name)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLoadPreset(p.proposal, p.name); }}
                        >
                          <div className="preset-card-header">
                            <h4>{p.name}</h4>
                            <button
                              className="delete-preset-btn"
                              onClick={(e) => handleDeleteCustomPreset(p.catalogId, e)}
                              aria-label={`Delete saved catalog ${p.name}`}
                              title="Delete catalog"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <span className="preset-id-tag">{p.catalogId}</span>
                          <span className="preset-time-tag">{new Date(p.timestamp).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: INTERACTIVE CONTROLS */}
            {activeTab === 'params' && (
              <div className="parameters-tab">
                {/* METADATA ACCORDION */}
                <div className="architect-section">
                  <h3>AI INTENT METADATA</h3>
                  <div className="input-group">
                    <label htmlFor="wand-rationale">Rationale (Visual Intention)</label>
                    <textarea
                      id="wand-rationale"
                      value={proposal.rationale}
                      onChange={(e) => updateRootField('rationale', e.target.value)}
                      placeholder="Enter visual intent rationale..."
                    />
                  </div>
                  <div className="input-row">
                    <div className="input-group flex-1">
                      <label htmlFor="wand-confidence">Confidence Rating (0 - 1)</label>
                      <input
                        id="wand-confidence"
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={proposal.confidence}
                        onChange={(e) => updateRootField('confidence', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="input-group flex-1 flex-row-align">
                      <input 
                        type="checkbox" 
                        id="reviewRequired" 
                        checked={proposal.reviewRequired}
                        onChange={(e) => updateRootField('reviewRequired', e.target.checked)}
                      />
                      <label htmlFor="reviewRequired" className="checkbox-label">Review Required</label>
                    </div>
                  </div>
                  <div className="input-row">
                    <div className="input-group flex-1">
                      <label htmlFor="wand-source-intent-hash">Source Intent Hash</label>
                      <input
                        id="wand-source-intent-hash"
                        type="text"
                        value={proposal.sourceIntentHash || ''}
                        onChange={(e) => updateRootField('sourceIntentHash', e.target.value)}
                      />
                    </div>
                    <div className="input-group flex-1">
                      <label htmlFor="wand-eval-suite-id">Eval Suite ID</label>
                      <input
                        id="wand-eval-suite-id"
                        type="text"
                        value={proposal.evalSuiteId || ''}
                        onChange={(e) => updateRootField('evalSuiteId', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* ROLE BINDING CONFIGURATION */}
                <div className="architect-section border-top">
                  <h3>ROLE DISPATCHER BINDING</h3>
                  <div className="input-row">
                    <div className="input-group flex-1">
                      <label htmlFor="wand-semantic-role">Semantic Role</label>
                      <select
                        id="wand-semantic-role"
                        value={proposal.proposedFormula.role}
                        onChange={(e) => updateProposedFormulaField('role', e.target.value)}
                      >
                        <option value="shrine.window">shrine.window (Cathedral Stained Glass)</option>
                        <option value="shrine.moon">shrine.moon (Lunar Halos)</option>
                        <option value="shrine.cabinet">shrine.cabinet (Shelves & Cabinets)</option>
                        <option value="shrine.altar">shrine.altar (Monolithic Altar)</option>
                        <option value="sigil.capsule">sigil.capsule (Orb Protect Sigil)</option>
                        <option value="text.vector">text.vector (Vector Neon Ink)</option>
                        <option value="ink.ballpoint">ink.ballpoint (Anime Heavy Outline)</option>
                        <option value="debug.pointCloud">debug.pointCloud (Custom Dev Role)</option>
                      </select>
                    </div>
                    <div className="input-group flex-1">
                      <label htmlFor="wand-material-preset">Material Preset</label>
                      <select
                        id="wand-material-preset"
                        value={proposal.proposedFormula.material || 'aura'}
                        onChange={(e) => updateProposedFormulaField('material', e.target.value)}
                      >
                        <option value="gold">Gold Ink</option>
                        <option value="stone">Slate Stone</option>
                        <option value="aurora">Aurora Glow</option>
                        <option value="aura">Ethereal Aura</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* VISUAL DIALECT SELECTOR */}
                <div className="architect-section border-top">
                  <h3>VISUAL DIALECT SELECTOR</h3>
                  <div className="dialect-button-group">
                    {['parametric_curve', 'grid_projection', 'fibonacci', 'fractal_iter', 'composite', 'vectorized_text'].map(type => (
                      <button 
                        key={type}
                        className={`dialect-select-btn animate-btn ${proposal.proposedFormula.formula.type === type ? 'active' : ''}`}
                        onClick={() => setFormulaType(type)}
                      >
                        {type.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  {/* TYPE-SPECIFIC PARAMETERS */}
                  <div className="dialect-parameters">
                    
                    {/* 1. PARAMETRIC CURVE */}
                    {proposal.proposedFormula.formula.type === 'parametric_curve' && (
                      <div className="dialect-subfields">
                        <h4>Parametric Curve (Sample limit n ≤ 512)</h4>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-param-n">Samples count (n)</label>
                            <span>{proposal.proposedFormula.formula.parameters?.n ?? 128}</span>
                          </div>
                          <input
                            id="wand-param-n"
                            type="range" min="16" max="512" step="16"
                            value={proposal.proposedFormula.formula.parameters?.n ?? 128}
                            onChange={(e) => updateLeafParam('n', parseInt(e.target.value))}
                          />
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-param-a">Amplitude / Radius (a)</label>
                            <span>{proposal.proposedFormula.formula.parameters?.a ?? 100}</span>
                          </div>
                          <input
                            id="wand-param-a"
                            type="range" min="-400" max="400" step="10"
                            value={proposal.proposedFormula.formula.parameters?.a ?? 100}
                            onChange={(e) => updateLeafParam('a', parseInt(e.target.value))}
                          />
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-param-b">Frequencies multiplier (b)</label>
                            <span>{proposal.proposedFormula.formula.parameters?.b ?? 0.1}</span>
                          </div>
                          <input
                            id="wand-param-b"
                            type="range" min="0" max="5" step="0.05"
                            value={proposal.proposedFormula.formula.parameters?.b ?? 0.1}
                            onChange={(e) => updateLeafParam('b', parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                    )}

                    {/* 2. GRID PROJECTION */}
                    {proposal.proposedFormula.formula.type === 'grid_projection' && (
                      <div className="dialect-subfields">
                        <h4>Grid Projection (Cell Size ≥ 4)</h4>
                        <div className="input-group">
                          <label htmlFor="wand-grid-type">Grid Alignment Type</label>
                          <select
                            id="wand-grid-type"
                            value={proposal.proposedFormula.formula.gridType}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    gridType: e.target.value
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          >
                            <option value="rectangular">Rectangular Grid</option>
                            <option value="hexagonal">Hexagonal Subdivision</option>
                            <option value="isometric">Isometric Lattice</option>
                          </select>
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-cell-size">Minimum Cell Size</label>
                            <span>{proposal.proposedFormula.formula.cellSize ?? 12}</span>
                          </div>
                          <input
                            id="wand-cell-size"
                            type="range" min="4" max="32" step="2"
                            value={proposal.proposedFormula.formula.cellSize ?? 12}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    cellSize: parseInt(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* 3. FIBONACCI */}
                    {proposal.proposedFormula.formula.type === 'fibonacci' && (
                      <div className="dialect-subfields">
                        <h4>Fibonacci Subdivision</h4>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-iterations-fib">Recursive Subdivisions</label>
                            <span>{proposal.proposedFormula.formula.iterations ?? 6}</span>
                          </div>
                          <input
                            id="wand-iterations-fib"
                            type="range" min="1" max="12" step="1"
                            value={proposal.proposedFormula.formula.iterations ?? 6}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    iterations: parseInt(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-scale">Scale Factor</label>
                            <span>{(proposal.proposedFormula.formula.scale ?? 1.0).toFixed(2)}</span>
                          </div>
                          <input
                            id="wand-scale"
                            type="range" min="0.1" max="5.0" step="0.05"
                            value={proposal.proposedFormula.formula.scale ?? 1.0}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    scale: parseFloat(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* 4. FRACTAL ITERATION */}
                    {proposal.proposedFormula.formula.type === 'fractal_iter' && (
                      <div className="dialect-subfields">
                        <h4>Fractal Iteration (Limit: 5 iterations)</h4>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-iterations-fractal">Iterations</label>
                            <span>{proposal.proposedFormula.formula.iterations ?? 3}</span>
                          </div>
                          <input
                            id="wand-iterations-fractal"
                            type="range" min="1" max="5" step="1"
                            value={proposal.proposedFormula.formula.iterations ?? 3}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    iterations: parseInt(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="wand-base-shape">Base Geometry Shape</label>
                          <select
                            id="wand-base-shape"
                            value={proposal.proposedFormula.formula.baseShape}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    baseShape: e.target.value
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          >
                            <option value="triangle">Sierpinski Triangle</option>
                            <option value="square">Vicsek Fractal Square</option>
                            <option value="circle">Concentric Spheres</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* 5. COMPOSITE RECURSIVE ARCHITECTURE */}
                    {proposal.proposedFormula.formula.type === 'composite' && (
                      <div className="dialect-subfields">
                        <div className="composite-header">
                          <h4>Composite Layers (Max Depth 4, Children ≤ 12)</h4>
                          <button 
                            className="add-child-btn animate-btn"
                            onClick={() => {
                              const currentChildren = proposal.proposedFormula.formula.children || [];
                              if (currentChildren.length >= 12) {
                                addTerminalLog("Cannot exceed 12 composite children coordinates.", "error");
                                return;
                              }
                              const newChild = {
                                role: "sigil.capsule",
                                anchor: { x: 0.5, y: 0.5 },
                                size: { w: 0.2, h: 0.2 },
                                material: "aura",
                                formula: {
                                  type: "parametric_curve",
                                  parameters: { cx: 400, cy: 300, a: 50, b: 0.1, c: 0, n: 32 }
                                }
                              };
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    children: [...currentChildren, newChild]
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          >
                            <Plus size={12} /> Add Child Layer
                          </button>
                        </div>

                        <div className="composite-children-list">
                          {(proposal.proposedFormula.formula.children || []).map((child, idx) => (
                            <div key={idx} className="composite-child-item">
                              <div className="child-item-header">
                                <h5>Child #{idx + 1}: {child.role}</h5>
                                <button
                                  className="remove-child-btn"
                                  aria-label={`Remove child layer ${idx + 1}`}
                                  title="Remove child layer"
                                  onClick={() => {
                                    const updatedChildren = [...proposal.proposedFormula.formula.children];
                                    updatedChildren.splice(idx, 1);
                                    const updated = {
                                      ...proposal,
                                      proposedFormula: {
                                        ...proposal.proposedFormula,
                                        formula: {
                                          ...proposal.proposedFormula.formula,
                                          children: updatedChildren
                                        }
                                      }
                                    };
                                    handleProposalChange(updated, 'visual');
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              
                              <div className="input-row">
                                <div className="input-group flex-1">
                                  <label htmlFor={`wand-child-role-${idx}`}>Role</label>
                                  <select
                                    id={`wand-child-role-${idx}`}
                                    value={child.role}
                                    onChange={(e) => {
                                      const updatedChildren = proposal.proposedFormula.formula.children.map(
                                        (c, i) => (i === idx ? { ...c, role: e.target.value } : c)
                                      );
                                      const updated = {
                                        ...proposal,
                                        proposedFormula: {
                                          ...proposal.proposedFormula,
                                          formula: {
                                            ...proposal.proposedFormula.formula,
                                            children: updatedChildren
                                          }
                                        }
                                      };
                                      handleProposalChange(updated, 'visual');
                                    }}
                                  >
                                    <option value="shrine.window">shrine.window</option>
                                    <option value="shrine.moon">shrine.moon</option>
                                    <option value="shrine.cabinet">shrine.cabinet</option>
                                    <option value="shrine.altar">shrine.altar</option>
                                    <option value="sigil.capsule">sigil.capsule</option>
                                  </select>
                                </div>
                                <div className="input-group flex-1">
                                  <span className="input-group-label">Anchor (x, y)</span>
                                  <div className="double-inputs">
                                    <input 
                                      type="number" step="0.05" min="0" max="1"
                                      value={child.anchor.x}
                                      onChange={(e) => {
                                        const updatedChildren = proposal.proposedFormula.formula.children.map(
                                          (c, i) => (i === idx ? { ...c, anchor: { ...c.anchor, x: parseFloat(e.target.value) || 0 } } : c)
                                        );
                                        const updated = {
                                          ...proposal,
                                          proposedFormula: {
                                            ...proposal.proposedFormula,
                                            formula: {
                                              ...proposal.proposedFormula.formula,
                                              children: updatedChildren
                                            }
                                          }
                                        };
                                        handleProposalChange(updated, 'visual');
                                      }}
                                    />
                                    <input 
                                      type="number" step="0.05" min="0" max="1"
                                      value={child.anchor.y}
                                      onChange={(e) => {
                                        const updatedChildren = proposal.proposedFormula.formula.children.map(
                                          (c, i) => (i === idx ? { ...c, anchor: { ...c.anchor, y: parseFloat(e.target.value) || 0 } } : c)
                                        );
                                        const updated = {
                                          ...proposal,
                                          proposedFormula: {
                                            ...proposal.proposedFormula,
                                            formula: {
                                              ...proposal.proposedFormula.formula,
                                              children: updatedChildren
                                            }
                                          }
                                        };
                                        handleProposalChange(updated, 'visual');
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 6. VECTORIZED TEXT */}
                    {proposal.proposedFormula.formula.type === 'vectorized_text' && (
                      <div className="dialect-subfields">
                        <h4>Vectorized Neon Ink (Limit: 32 chars)</h4>
                        <div className="input-group">
                          <label htmlFor="wand-inscription">Spell Inscription (Uppercase A-Z, 0-9, Space)</label>
                          <input
                            id="wand-inscription"
                            type="text"
                            maxLength={32}
                            value={proposal.proposedFormula.formula.text ?? ''}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    text: val
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                            placeholder="ARCANE 404"
                          />
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-font-size">Font Size (px)</label>
                            <span>{proposal.proposedFormula.formula.fontSize ?? 24}</span>
                          </div>
                          <input
                            id="wand-font-size"
                            type="range" min="10" max="100" step="1"
                            value={proposal.proposedFormula.formula.fontSize ?? 24}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    fontSize: parseInt(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-spacing">Spacing</label>
                            <span>{(proposal.proposedFormula.formula.spacing ?? 1.0).toFixed(2)}</span>
                          </div>
                          <input
                            id="wand-spacing"
                            type="range" min="0.1" max="5.0" step="0.05"
                            value={proposal.proposedFormula.formula.spacing ?? 1.0}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    spacing: parseFloat(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-cx">Center X (cx)</label>
                            <span>{proposal.proposedFormula.formula.cx ?? 400}</span>
                          </div>
                          <input
                            id="wand-cx"
                            type="range" min="0" max="800" step="10"
                            value={proposal.proposedFormula.formula.cx ?? 400}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    cx: parseInt(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                        <div className="range-group">
                          <div className="range-header">
                            <label htmlFor="wand-cy">Center Y (cy)</label>
                            <span>{proposal.proposedFormula.formula.cy ?? 300}</span>
                          </div>
                          <input
                            id="wand-cy"
                            type="range" min="0" max="600" step="10"
                            value={proposal.proposedFormula.formula.cy ?? 300}
                            onChange={(e) => {
                              const updated = {
                                ...proposal,
                                proposedFormula: {
                                  ...proposal.proposedFormula,
                                  formula: {
                                    ...proposal.proposedFormula.formula,
                                    cy: parseInt(e.target.value)
                                  }
                                }
                              };
                              handleProposalChange(updated, 'visual');
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RAW JSON EDITOR */}
            {activeTab === 'json' && (
              <div className="raw-json-tab">
                <h3>RAW GRIMOIRE SCHEMA</h3>
                <p className="schema-description">Directly edit the visual proposal JSON bytes. Validates schema and capped parameters in real-time.</p>
                <textarea 
                  className="json-textarea monospace-font"
                  value={rawJsonText}
                  onChange={(e) => handleJsonTextChange(e.target.value)}
                  placeholder="Input custom alchemical JSON proposal..."
                />
              </div>
            )}

          </div>
        </section>

        {/* RIGHT PREVIEW & TELEMETRY */}
        <section className="wand-visual-panel flex-panel" aria-label="Visual preview">
          {/* INTERACTIVE CANVAS */}
          <div className="canvas-header">
            <div className="preview-label">
              <Layers size={14} className="text-gold" />
              <h3>SANCTUARY PREVIEW</h3>
            </div>
            
            <div className="preview-telemetry">
              <span className={`points-count ${metrics.overflowed ? 'text-warning font-bold' : ''}`}>
                {metrics.pointCount} Coords {metrics.overflowed ? '(CAPPED)' : ''}
              </span>
              <span className={`status-indicator ${validationResult.valid ? 'success' : 'error'}`}>
                {validationResult.valid ? 'PROPOSAL VALID' : 'PROPOSAL INVALID'}
              </span>
            </div>
          </div>

          <div className="canvas-canvas-container">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="magic-canvas"
              role="img"
              aria-label={`Sanctuary preview rendering ${metrics.pointCount} coordinate points for role ${proposal.proposedFormula?.role || 'unknown'}`}
            />
            {/* Real-time Telemetry Panel */}
            <AnimatePresence>
              {(quantStats || photonicRoute) && (
                <motion.div
                  className="tq-telemetry-panel"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
                >
                  <div className="crt-scanlines" />
                  <div className="telemetry-split-layout">
                    {/* Left Column: TurboQuant / Coordinates */}
                    <div className="telemetry-column">
                      {quantStats ? (
                        <>
                          <div className="telemetry-header-bar">
                            <span className="telemetry-title">⚡ AETHERLINK TURBOQUANT CORE</span>
                            <span className={`backend-badge ${quantStats.backend === 'wasm' ? 'wasm-active' : 'js-fallback'}`}>
                              <span className="badge-beacon" />
                              {quantStats.backend === 'wasm' ? 'WASM' : 'JS FALLBACK'}
                            </span>
                          </div>
                          <div className="telemetry-grid-2">
                            <div className="metric-box">
                              <span className="metric-label">COMPRESSION RATIO</span>
                              <span className="metric-value text-glow-cyan">
                                {(quantStats.compressionRatio * 100).toFixed(1)}%
                              </span>
                              <span className="metric-sub">
                                {(100 - quantStats.compressionRatio * 100).toFixed(1)}% saved space
                              </span>
                            </div>
                            <div className="metric-box">
                              <span className="metric-label">RAW VECTORS</span>
                              <span className="metric-value">
                                {quantStats.originalLength} <span className="metric-unit">px</span>
                              </span>
                              <span className="metric-sub">
                                {(quantStats.originalLength * Float32Array.BYTES_PER_ELEMENT).toLocaleString()} Bytes
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="telemetry-header-bar">
                            <span className="telemetry-title">⚡ SANCTUARY COORDINATES SUMMARY</span>
                            <span className="backend-badge js-fallback">
                              <span className="badge-beacon" />
                              UNQUANTIZED
                            </span>
                          </div>
                          <div className="telemetry-grid-2">
                            <div className="metric-box">
                              <span className="metric-label">COORDINATE POINTS</span>
                              <span className="metric-value text-glow-cyan">
                                {coordinates.length}
                              </span>
                              <span className="metric-sub">
                                Active plotted points
                              </span>
                            </div>
                            <div className="metric-box">
                              <span className="metric-label">DIMENSIONALITY</span>
                              <span className="metric-value">
                                2D <span className="metric-unit">(x, y)</span>
                              </span>
                              <span className="metric-sub">
                                Plotted in coordinate space
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right Column: Photonic Bridge */}
                    {photonicRoute && (
                      <div className="telemetry-column border-left-cyan">
                        <div className="telemetry-header-bar">
                          <span className="telemetry-title text-gold">🌀 PHOTONIC QUANTIZATION BRIDGE</span>
                          <span className={`backend-badge grade-badge grade-${String(photonicRoute.bridgeReport?.compatibilityGrade || 'F').toLowerCase()}`}>
                            GRADE {photonicRoute.bridgeReport?.compatibilityGrade || 'F'}
                          </span>
                        </div>
                        <div className="telemetry-grid-2">
                          <div className="metric-box">
                            <span className="metric-label">COMPATIBILITY SCORE</span>
                            <span className="metric-value text-glow-gold">
                              {(photonicRoute.bridgeReport?.compatibilityScore || 0).toFixed(4)}
                            </span>
                            <span className="metric-sub text-glow-gold font-bold">
                              {photonicRoute.bridgeReport?.compatibilityGrade === 'A' || photonicRoute.bridgeReport?.compatibilityGrade === 'B' ? '🚀 OPTICAL READY' : '⚠️ HIGH LOSS'}
                            </span>
                          </div>
                          {photonicRoute.opticalSimulation && (
                            <div className="metric-box">
                              <span className="metric-label">SIMULATED LATENCY / POWER</span>
                              <span className="metric-value text-glow-aurora">
                                {photonicRoute.opticalSimulation.estimatedLatencyNs?.toFixed(1)} <span className="metric-unit">ns</span>
                              </span>
                              <span className="metric-sub text-glow-aurora">
                                {photonicRoute.opticalSimulation.estimatedPowerPj?.toFixed(1)} pJ // {photonicRoute.opticalSimulation.photonicOpCount} Ops
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* REAL-TIME DIAGNOSTICS & TERMINAL */}
          <div className="wand-terminal-section">
            <div className="terminal-header">
              <Terminal size={14} className="text-gold" />
              <h3>LIVE RITUAL DIAGNOSTICS</h3>
            </div>
            
            <div className="terminal-body monospace-font">
              {diagnostics.length > 0 && (
                <div className="diagnostic-alerts">
                  {diagnostics.map((diag, index) => (
                    <div key={index} className={`diagnostic-alert-card ${diag.type === 'FORMULA_PROPOSAL_REJECTED' ? 'error-card' : 'warn-card'}`}>
                      <div className="alert-card-title">
                        {diag.type === 'FORMULA_PROPOSAL_REJECTED' ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
                        <h4>{diag.type}</h4>
                        {diag.bytecodeError && <span className="bytecode-label">{diag.bytecodeError}</span>}
                      </div>
                      {diag.errors ? (
                        <ul>
                          {diag.errors.map((err, eIdx) => <li key={eIdx}>{err}</li>)}
                        </ul>
                      ) : (
                        <p>{diag.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="terminal-logs">
                {terminalLogs.map((log, idx) => (
                  <div key={idx} className={`log-line log-${log.severity}`}>
                    <span className="log-time">[{log.timestamp}]</span>
                    <span className="log-text">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
