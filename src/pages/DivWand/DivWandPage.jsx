import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResizableBox } from 'react-resizable';
import {
  Sparkles, Terminal, Save, AlertTriangle, CheckCircle,
  Sliders, Copy, AlignLeft, Grid, ZoomIn, ZoomOut, X,
  Download,
} from 'lucide-react';
import { validateDivProposal } from '../../lib/engine.adapter.js';
import { VoxelScenePortal } from './components/VoxelScenePortal.jsx';
import { WorldScenePortal } from './components/WorldScenePortal.jsx';
import { generateCatalogId } from '../../lib/catalogId.js';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import obsidianChoirCrystalProposal from './obsidian-choir-crystal.formula.json';
import './DivWandPage.css';

// ── BROWSER-SAFE CATALOG ──────────────────────────────────────────────────────
// Mirrors div-layout-registrar.js using the shared catalog hasher + localStorage
// instead of node:fs. Hash helpers live in src/lib/catalogId.js (shared with Wand).

const CATALOG_KEY = 'scholomance.div-catalog';

function browserRegisterDivLayout(proposal) {
  const role       = proposal.proposedLayout.role;
  const intentHash = proposal.sourceIntentHash || '';
  const catalogId  = generateCatalogId(role, proposal.proposedLayout, intentHash, 'cat-div');

  let existing = [];
  try { existing = JSON.parse(localStorage.getItem(CATALOG_KEY) || '[]'); } catch { existing = []; }

  const alreadyRegistered = existing.some(e => e.catalogId === catalogId);
  if (!alreadyRegistered) {
    existing.push({ catalogId, timestamp: Date.now(), proposal }); // EXEMPT
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(existing)); } catch { /* quota */ }
  }

  return { catalogId, alreadyRegistered, count: existing.length };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function snapPx(value, gridSize = 8) {
  return Math.round((Number(value) || 0) / gridSize) * gridSize;
}

function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children?.reduce((sum, c) => sum + countNodes(c), 0) ?? 0);
}

function maxDepth(node, d = 0) {
  if (!node) return d;
  if (!node.children?.length) return d;
  return Math.max(...node.children.map(c => maxDepth(c, d + 1)));
}

function ts() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

// ── PRESETS ───────────────────────────────────────────────────────────────────

const PRESETS = [
  {
    id: 'preset-alchemist-card',
    name: 'Alchemist Card',
    proposal: {
      rationale: 'Synthesize high-acuity grimoire card layout with neon highlights.',
      confidence: 0.98,
      reviewRequired: false,
      sourceIntentHash: 'alchemist-card-core',
      evalSuiteId: 'suite-cards',
      proposedLayout: {
        id: 'root-wrapper',
        type: 'container',
        role: 'wrapper',
        layout: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%', padding: 24 },
        style: { variant: 'transparent' },
        children: [
          {
            id: 'spell-card',
            type: 'container',
            role: 'card',
            layout: { display: 'flex', flexDirection: 'column', width: 320, height: 400, padding: 16, gap: 12 },
            style: { variant: 'glassmorphic', glowColor: 'alchemy', borderRadius: 12 },
            props: { interactive: true },
            children: [
              {
                id: 'spell-header',
                type: 'container',
                role: 'header',
                layout: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 40 },
                style: { variant: 'transparent' },
                children: [
                  { id: 'spell-title', type: 'element', role: 'text', props: { title: 'Transmutation Arc' } },
                  { id: 'spell-badge', type: 'element', role: 'badge', style: { variant: 'neonBorder', glowColor: 'will' }, props: { text: 'Lvl 4' } },
                ],
              },
              {
                id: 'spell-content',
                type: 'container',
                role: 'content',
                layout: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 16, height: 240 },
                style: { variant: 'obsidianPanel', borderRadius: 8 },
                children: [
                  { id: 'spell-glyph-box', type: 'element', role: 'glow-container', style: { variant: 'neonBorder', glowColor: 'psychic', borderRadius: 40 }, layout: { width: 80, height: 80 }, props: { icon: 'Sparkles' } },
                ],
              },
              {
                id: 'spell-footer',
                type: 'container',
                role: 'footer',
                layout: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 48 },
                style: { variant: 'transparent' },
                children: [
                  { id: 'spell-btn', type: 'element', role: 'button', style: { variant: 'neonBorder', glowColor: 'will', borderRadius: 4 }, layout: { padding: 8, width: 120 }, props: { text: 'Cast Spell', onClickAction: 'heal' } },
                ],
              },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'preset-dashboard',
    name: 'Grimoire Dashboard',
    proposal: {
      rationale: 'Establish multi-column matrix panels for comprehensive alignment tracking.',
      confidence: 0.94,
      reviewRequired: false,
      sourceIntentHash: 'grimoire-dash-v1',
      proposedLayout: {
        id: 'dash-wrapper',
        type: 'container',
        role: 'wrapper',
        layout: { display: 'flex', flexDirection: 'row', gap: 16, padding: 16, width: '100%', height: '100%' },
        style: { variant: 'transparent' },
        children: [
          {
            id: 'left-panel',
            type: 'container',
            role: 'card',
            layout: { display: 'flex', flexDirection: 'column', width: '48%', padding: 16, gap: 12 },
            style: { variant: 'glassmorphic', glowColor: 'sonic', borderRadius: 8 },
            children: [{ id: 'left-title', type: 'element', role: 'text', props: { title: 'Resonance Codex', subtitle: 'Active vocal formants' } }],
          },
          {
            id: 'right-panel',
            type: 'container',
            role: 'card',
            layout: { display: 'flex', flexDirection: 'column', width: '48%', padding: 16, gap: 12 },
            style: { variant: 'obsidianPanel', borderRadius: 8 },
            children: [{ id: 'right-title', type: 'element', role: 'text', props: { title: 'Predictive Inquest', subtitle: '51 vectors scanned' } }],
          },
        ],
      },
    },
  },
  {
    id: 'preset-obsidian-choir',
    name: 'Obsidian Choir',
    proposal: obsidianChoirCrystalProposal,
  },
  {
    id: 'preset-hud',
    name: 'Combat HUD',
    proposal: {
      rationale: 'Dense combat overlay showing active spell slots and power metrics.',
      confidence: 0.91,
      reviewRequired: false,
      sourceIntentHash: 'combat-hud-v1',
      proposedLayout: {
        id: 'hud-root',
        type: 'container',
        role: 'wrapper',
        layout: { display: 'flex', flexDirection: 'column', gap: 8, padding: 16, width: '100%', height: '100%' },
        style: { variant: 'transparent' },
        children: [
          {
            id: 'hud-header',
            type: 'container',
            role: 'header',
            layout: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 48 },
            style: { variant: 'glassmorphic', glowColor: 'void', borderRadius: 6 },
            children: [
              { id: 'hud-player', type: 'element', role: 'text', props: { title: 'Vael Shadowtongue', subtitle: 'School of Void' } },
              { id: 'hud-xp', type: 'element', role: 'badge', style: { variant: 'neonBorder', glowColor: 'sonic' }, props: { text: '4200 XP' } },
            ],
          },
          {
            id: 'hud-row',
            type: 'container',
            role: 'row',
            layout: { display: 'flex', flexDirection: 'row', gap: 8, height: 80 },
            style: { variant: 'transparent' },
            children: [
              { id: 'slot-1', type: 'element', role: 'glow-container', style: { variant: 'neonBorder', glowColor: 'alchemy', borderRadius: 6 }, layout: { width: 64, height: 64 } },
              { id: 'slot-2', type: 'element', role: 'glow-container', style: { variant: 'neonBorder', glowColor: 'psychic', borderRadius: 6 }, layout: { width: 64, height: 64 } },
              { id: 'slot-3', type: 'element', role: 'button', style: { variant: 'obsidianPanel', borderRadius: 6 }, layout: { width: 64, height: 64 }, props: { text: 'Cast' } },
            ],
          },
        ],
      },
    },
  },
];

// ── LAYOUT NODE ───────────────────────────────────────────────────────────────

const LayoutNode = memo(function LayoutNode({ node, depth, isInspectorActive, hoveredId, onHover, onLeave, rootRef }) {
  // mouseover/mouseout bubble, so stopPropagation makes the innermost node under
  // the cursor win without mutating the native event to dedupe handlers.
  const handleMouseEnter = useCallback((e) => {
    if (!node || !isInspectorActive) return;
    e.stopPropagation();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const rootRect = rootRef.current?.getBoundingClientRect();
    onHover({
      id: node.id,
      role: node.role,
      type: node.type,
      depth,
      intendedLayout: node.layout || {},
      actualRect: {
        x:      Math.round(rect.left - (rootRect?.left ?? 0)),
        y:      Math.round(rect.top  - (rootRect?.top  ?? 0)),
        width:  Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }, [isInspectorActive, node, depth, onHover, rootRef]);

  const handleMouseLeave = useCallback((e) => {
    if (!node || !isInspectorActive) return;
    e.stopPropagation();
    onLeave(node.id);
  }, [isInspectorActive, node, onLeave]);

  if (!node) return null;

  const variantClass     = node.style?.variant    ? `variant-${node.style.variant}`    : '';
  const glowClass        = node.style?.glowColor   ? `div-glow-${node.style.glowColor}` : '';
  const interactiveClass = node.props?.interactive  ? 'div-interactive'                  : '';
  const highlightClass   = isInspectorActive && hoveredId === node.id ? 'inspector-highlight' : '';

  const className = ['div-node', variantClass, glowClass, interactiveClass, highlightClass]
    .filter(Boolean).join(' ');

  const style = {
    display:             node.layout?.display,
    position:            node.layout?.position,
    top:    typeof node.layout?.top    === 'number' ? `${snapPx(node.layout.top)}px`    : node.layout?.top,
    left:   typeof node.layout?.left   === 'number' ? `${snapPx(node.layout.left)}px`   : node.layout?.left,
    right:  typeof node.layout?.right  === 'number' ? `${snapPx(node.layout.right)}px`  : node.layout?.right,
    bottom: typeof node.layout?.bottom === 'number' ? `${snapPx(node.layout.bottom)}px` : node.layout?.bottom,
    width:   typeof node.layout?.width   === 'number' ? `${node.layout.width}px`   : node.layout?.width,
    height:  typeof node.layout?.height  === 'number' ? `${node.layout.height}px`  : node.layout?.height,
    padding: typeof node.layout?.padding === 'number' ? `${node.layout.padding}px` : node.layout?.padding,
    margin:  typeof node.layout?.margin  === 'number' ? `${node.layout.margin}px`  : node.layout?.margin,
    gap:     typeof node.layout?.gap     === 'number' ? `${node.layout.gap}px`     : node.layout?.gap,
    flexDirection:       node.layout?.flexDirection,
    justifyContent:      node.layout?.justifyContent,
    alignItems:          node.layout?.alignItems,
    gridTemplateColumns: node.layout?.gridTemplateColumns,
    gridTemplateRows:    node.layout?.gridTemplateRows,
    borderRadius: typeof node.style?.borderRadius === 'number' ? `${node.style.borderRadius}px` : node.style?.borderRadius,
    opacity: node.style?.opacity,
  };

  const sharedProps = {
    // NOTE: node.id is emitted as a real DOM id because the inspector QA suite
    // (and any external selector) queries nodes by `#id`. User JSON *can* carry
    // duplicate ids (invalid DOM), but that's an authoring-data concern, not
    // something to fix by breaking the id selector contract.
    id: node.id,
    className,
    style,
    onMouseOver: handleMouseEnter,
    onMouseOut: handleMouseLeave
  };

  if (node.type === 'voxel') {
    return <VoxelScenePortal node={node} />;
  }

  if (node.type === 'world') {
    return <WorldScenePortal node={node} />;
  }

  if (node.type === 'element') {
    return (
      <div {...sharedProps}>
        {node.role === 'text' && (
          <div className="div-elem-text">
            {node.props?.title    && <div className="div-elem-title">{node.props.title}</div>}
            {node.props?.subtitle && <div className="div-elem-subtitle">{node.props.subtitle}</div>}
            {node.props?.text     && <span>{node.props.text}</span>}
          </div>
        )}
        {node.role === 'badge' && <span className="div-elem-badge">{node.props?.text}</span>}
        {node.role === 'button' && <button className="div-elem-button">{node.props?.text || 'Submit'}</button>}
        {node.role === 'glow-container' && (
          <div className="div-elem-glow-container"><Sparkles size={22} /></div>
        )}
      </div>
    );
  }

  return (
    <div {...sharedProps}>
      {node.children?.map(child => (
        <LayoutNode
          key={child.id}
          node={child}
          depth={depth + 1}
          isInspectorActive={isInspectorActive}
          hoveredId={hoveredId}
          onHover={onHover}
          onLeave={onLeave}
          rootRef={rootRef}
        />
      ))}
    </div>
  );
});

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default function DivWandPage({ onSendToVideoForge } = {}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [selectedPreset, setSelectedPreset]     = useState(PRESETS[0]);
  const [proposalText, setProposalText]         = useState(() => JSON.stringify(PRESETS[0].proposal, null, 2));
  const [validationResult, setValidationResult] = useState({ valid: true, ok: true, errors: [] });
  const [terminalLogs, setTerminalLogs]         = useState([]);
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [hoveredNodeInfo, setHoveredNodeInfo]   = useState(null);
  const [zoom, setZoom]       = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [copied, setCopied]   = useState(false);

  const previewRootRef = useRef(null);
  const debounceRef    = useRef(null);
  const terminalRef    = useRef(null);

  // ── VALIDATION ─────────────────────────────────────────────────────────────

  const runValidation = useCallback((jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      const outcome = validateDivProposal(parsed);
      setValidationResult(outcome);
      if (outcome.valid) {
        setTerminalLogs(prev => [...prev, { type: 'success', text: 'Validation passed - all nodes comply.', ts: ts() }]);
      } else {
        setTerminalLogs(prev => [
          ...prev,
          ...outcome.errors.map(err => ({ type: 'error', text: err, ts: ts() })),
        ]);
      }
    } catch (e) {
      setValidationResult({ valid: false, ok: false, errors: [e.message] });
      setTerminalLogs(prev => [...prev, { type: 'error', text: `JSON syntax: ${e.message}`, ts: ts() }]);
    }
  }, []);

  const debouncedValidate = useCallback((text) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runValidation(text), 280);
  }, [runValidation]);

  // ── ACTIONS ────────────────────────────────────────────────────────────────

  const handlePresetSelect = useCallback((preset) => {
    setSelectedPreset(preset);
    const text = JSON.stringify(preset.proposal, null, 2);
    setProposalText(text);
    debouncedValidate(text);
    setTerminalLogs(prev => [...prev, { type: 'info', text: `Loaded: ${preset.name}`, ts: ts() }]);
  }, [debouncedValidate]);

  const handleEditorChange = useCallback((e) => {
    const text = e.target.value;
    setProposalText(text);
    debouncedValidate(text);
    // Manual edits diverge from the loaded preset - drop the active pill so the
    // highlight reflects what's actually in the editor.
    setSelectedPreset(prev => (prev && text === JSON.stringify(prev.proposal, null, 2) ? prev : null));
  }, [debouncedValidate]);

  const handleFormatJSON = useCallback(() => {
    try {
      const parsed = JSON.parse(proposalText);
      setProposalText(JSON.stringify(parsed, null, 2));
      setTerminalLogs(prev => [...prev, { type: 'info', text: 'JSON formatted.', ts: ts() }]);
    } catch { /* invalid - nothing to format */ }
  }, [proposalText]);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(proposalText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      setTerminalLogs(prev => [...prev, { type: 'info', text: 'Copied to clipboard.', ts: ts() }]);
    });
  }, [proposalText]);

  const handleSaveProposal = useCallback(() => {
    try {
      const parsed = JSON.parse(proposalText);
      const outcome = browserRegisterDivLayout(parsed);
      setTerminalLogs(prev => [...prev, {
        type: 'success',
        text: `Cataloged - ${outcome.catalogId}${outcome.alreadyRegistered ? ' (idempotent)' : ''} · ${outcome.count} total`,
        ts: ts(),
      }]);
    } catch (e) {
      setTerminalLogs(prev => [...prev, { type: 'error', text: `Register failed: ${e.message}`, ts: ts() }]);
    }
  }, [proposalText]);

  const handleClearLogs = useCallback(() => setTerminalLogs([]), []);

  // ── INSPECTOR ─────────────────────────────────────────────────────────────

  const handleNodeHover = useCallback((info) => setHoveredNodeInfo(info), []);
  const handleNodeLeave = useCallback((id) => {
    setHoveredNodeInfo(prev => (prev?.id === id ? null : prev));
  }, []);

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSaveProposal();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        handleFormatJSON();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveProposal, handleFormatJSON]);

  // ── INITIAL VALIDATION ────────────────────────────────────────────────────

  useEffect(() => { runValidation(proposalText); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TERMINAL AUTO-SCROLL ──────────────────────────────────────────────────

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // ── DERIVED STATE ─────────────────────────────────────────────────────────

  const activeProposal = useMemo(() => {
    try {
      const p = JSON.parse(proposalText);
      return p?.proposedLayout ? p : null;
    } catch { return null; }
  }, [proposalText]);

  const nodeCount = useMemo(() => countNodes(activeProposal?.proposedLayout ?? null), [activeProposal]);
  const treeDepth = useMemo(() => maxDepth(activeProposal?.proposedLayout ?? null), [activeProposal]);
  const lineCount = useMemo(() => proposalText.split('\n').length, [proposalText]);

  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];
  const zoomIdx    = ZOOM_STEPS.indexOf(zoom);
  const canZoomIn  = zoomIdx < ZOOM_STEPS.length - 1;
  const canZoomOut = zoomIdx > 0;

  const handleSendToVideoForge = useCallback(() => {
    if (!onSendToVideoForge) return;

    try {
      const parsed = JSON.parse(proposalText);
      const outcome = validateDivProposal(parsed);
      if (!outcome.valid) {
        throw new Error(outcome.errors?.[0] || 'Layout proposal is invalid');
      }

      const role = parsed.proposedLayout?.role || 'layout';
      onSendToVideoForge({
        source: 'divwand',
        kind: 'pixelbrain',
        name: `DivWand ${role}`,
        pixelBrainPacket: {
          source: 'divwand',
          proposal: parsed,
          metrics: {
            nodeCount,
            treeDepth,
            lineCount,
          },
        },
        metadata: {
          source: 'divwand',
          role,
          nodeCount,
          treeDepth,
          lineCount,
        },
      });
      setTerminalLogs(prev => [...prev, { type: 'success', text: 'Sent DivWand layout to VideoForge timeline.', ts: ts() }]);
    } catch (e) {
      setTerminalLogs(prev => [...prev, { type: 'error', text: `VideoForge handoff failed: ${e.message}`, ts: ts() }]);
    }
  }, [lineCount, nodeCount, onSendToVideoForge, proposalText, treeDepth]);

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="dw-container">

      {/* HEADER */}
      <header className="dw-header">
        <div className="dw-header-title">
          <Sparkles className="dw-header-icon" size={16} aria-hidden="true" />
          <h1 className="dw-header-h1">DIV Wand</h1>
          <span className="dw-header-sub">Layout Proposal Sandbox</span>
        </div>
        <div className="dw-header-actions">
          <button
            className={`dw-btn${isInspectorActive ? ' dw-btn--active' : ''}`}
            onClick={() => setIsInspectorActive(v => !v)}
            aria-pressed={isInspectorActive}
            title="Toggle Inspector HUD"
          >
            <Sliders size={13} aria-hidden="true" />
            Inspector
          </button>
          <button
            className="dw-btn dw-btn--primary"
            onClick={handleSaveProposal}
            disabled={!validationResult.valid}
            title="Register to catalog (Ctrl+Enter)"
            aria-label="Register layout proposal to catalog"
          >
            <Save size={13} aria-hidden="true" />
            Register
          </button>

          {onSendToVideoForge && (
            <button
              className="dw-btn"
              onClick={handleSendToVideoForge}
              disabled={!validationResult.valid}
              title="Send this layout proposal into VideoForge as a PixelBrain clip"
              aria-label="Send DivWand layout proposal to VideoForge"
              type="button"
            >
              <Grid size={13} aria-hidden="true" />
              Send to Forge
            </button>
          )}
        </div>
      </header>

      {/* BODY */}
      <div className="dw-body">

        {/* EDITOR PANE */}
        <div className="dw-pane dw-pane--editor">

          <div className="dw-pane-bar">
            <span className="dw-pane-label">Proposal</span>
            <div className="dw-preset-pills" role="group" aria-label="Load preset">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  className={`dw-preset-pill${selectedPreset?.id === p.id ? ' dw-preset-pill--active' : ''}`}
                  onClick={() => handlePresetSelect(p)}
                  aria-pressed={selectedPreset?.id === p.id}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="dw-editor-toolbar">
            <span className="dw-editor-meta">{lineCount} lines</span>
            <button className="dw-tool-btn" onClick={handleFormatJSON} title="Format JSON (Ctrl+Shift+F)" aria-label="Format JSON">
              <AlignLeft size={12} aria-hidden="true" /> Format
            </button>
            <button className="dw-tool-btn" onClick={handleCopy} title="Copy proposal JSON" aria-label="Copy proposal JSON">
              <Copy size={12} aria-hidden="true" /> {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <div className="dw-textarea-wrap">
            <textarea
              className="dw-textarea"
              value={proposalText}
              onChange={handleEditorChange}
              spellCheck={false}
              aria-label="Proposal JSON editor"
              aria-multiline="true"
            />
          </div>

          <div className="dw-terminal">
            <div className="dw-pane-bar dw-pane-bar--sm">
              <span className="dw-pane-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Terminal size={11} aria-hidden="true" /> Log
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {validationResult.valid
                  ? <span className="dw-status dw-status--ok"><CheckCircle size={11} /> Valid</span>
                  : <span className="dw-status dw-status--err"><AlertTriangle size={11} /> {validationResult.errors.length} error{validationResult.errors.length !== 1 ? 's' : ''}</span>
                }
                <button className="dw-tool-btn dw-tool-btn--icon" onClick={handleClearLogs} title="Clear logs" aria-label="Clear logs">
                  <X size={11} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="dw-terminal-log" ref={terminalRef} role="log" aria-live="polite" aria-label="Validation log">
              {terminalLogs.length === 0 && <span className="dw-log-empty">Awaiting events...</span>}
              {terminalLogs.map((entry, i) => (
                <div key={i} className={`dw-log-entry dw-log-entry--${entry.type}`}>
                  <span className="dw-log-ts">{entry.ts}</span>
                  <span className="dw-log-text">{entry.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* PREVIEW PANE */}
        <div className="dw-pane dw-pane--preview">

          <div className="dw-pane-bar">
            <span className="dw-pane-label">
              Preview
              {nodeCount > 0 && (
                <span className="dw-meta-badge">{nodeCount} nodes · depth {treeDepth}</span>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className={`dw-tool-btn${showGrid ? ' dw-tool-btn--active' : ''}`}
                onClick={() => setShowGrid(v => !v)}
                aria-pressed={showGrid}
                title="Toggle pixel grid overlay"
                aria-label="Toggle pixel grid overlay"
              >
                <Grid size={12} aria-hidden="true" />
              </button>
              <div className="dw-zoom" role="group" aria-label="Zoom preview">
                <button className="dw-zoom-btn" onClick={() => canZoomOut && setZoom(ZOOM_STEPS[zoomIdx - 1])} disabled={!canZoomOut} aria-label="Zoom out">
                  <ZoomOut size={12} aria-hidden="true" />
                </button>
                <span className="dw-zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="dw-zoom-btn" onClick={() => canZoomIn && setZoom(ZOOM_STEPS[zoomIdx + 1])} disabled={!canZoomIn} aria-label="Zoom in">
                  <ZoomIn size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div className={`dw-canvas${showGrid ? ' dw-canvas--grid' : ''}`}>
            <div className="dw-crt" aria-hidden="true" />
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
              <ResizableBox
                width={800}
                height={480}
                minConstraints={[320, 240]}
                maxConstraints={[2400, 1600]}
                resizeHandles={['se', 's', 'e']}
                className="dw-preview-root"
              >
                <div ref={previewRootRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
                  {activeProposal ? (
                    <LayoutNode
                      node={activeProposal.proposedLayout}
                      depth={0}
                      isInspectorActive={isInspectorActive}
                      hoveredId={hoveredNodeInfo?.id ?? null}
                      onHover={handleNodeHover}
                      onLeave={handleNodeLeave}
                      rootRef={previewRootRef}
                    />
                  ) : (
                    <div className="dw-preview-empty" role="status">
                      <Sparkles size={26} aria-hidden="true" />
                      <span>Invalid JSON - no preview</span>
                    </div>
                  )}
                </div>
              </ResizableBox>
            </div>
          </div>

          <AnimatePresence>
            {isInspectorActive && hoveredNodeInfo && (
              <motion.div
                className="dw-hud"
                role="status"
                aria-label={`Inspecting node ${hoveredNodeInfo.id}`}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.14 }}
              >
                <div className="dw-hud-header">
                  <span className="dw-hud-id">{hoveredNodeInfo.id}</span>
                  <span className="dw-hud-depth">d{hoveredNodeInfo.depth}</span>
                </div>
                <dl className="dw-hud-dl">
                  <dt>role</dt>   <dd>{hoveredNodeInfo.role}</dd>
                  <dt>type</dt>   <dd>{hoveredNodeInfo.type}</dd>
                  <dt>intent w</dt><dd>{hoveredNodeInfo.intendedLayout.width  ?? 'auto'}</dd>
                  <dt>intent h</dt><dd>{hoveredNodeInfo.intendedLayout.height ?? 'auto'}</dd>
                  <dt>actual w</dt><dd className="dw-hud-measured">{hoveredNodeInfo.actualRect.width}px</dd>
                  <dt>actual h</dt><dd className="dw-hud-measured">{hoveredNodeInfo.actualRect.height}px</dd>
                  <dt>offset</dt> <dd>x:{hoveredNodeInfo.actualRect.x} y:{hoveredNodeInfo.actualRect.y}</dd>
                </dl>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
