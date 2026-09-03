/**
 * spec-intent-report.js
 *
 * Authored intent vs. effective output, for the ITEM-SPEC-v1 foundry (Door B).
 *
 * Closes finding #6 (MAJOR) of `divtube_downloader/DATA REPORTS/2026-09-03-pixelbrain-pipeline-ux-savage-audit.md`:
 *
 *   "the spec's `outline: {material:'void_gold'}` ... renders gold only on the
 *    pauldron arcs, not the silhouette; `bevelStrength: 1.1` produces no visible
 *    bevel gradient ... What you author is not reliably what you get, and
 *    nothing in the pipeline surfaces that gap back to the author."
 *
 * The last clause is the actionable one. This module is that missing surface.
 *
 * WHY OBSERVATION-ONLY
 * --------------------
 * `normalizeItemSpec` throws on a *missing* required field but silently
 * *coerces* an out-of-range one. That asymmetry is how the flagship asset ends
 * up authored `bevelStrength: 1.1 // stronger bevels` and rendered at exactly
 * 1.0. Verified in-tree 2026-09-03:
 *
 *   scripts/generate-void-chestplate.mjs:82    bevelStrength: 1.1  (authored)
 *   codex/core/pixelbrain/item-foundry.js:274  normalizeItemSpec(rawSpec)
 *   codex/core/pixelbrain/item-spec.js:199     clampNumber(raw.bevelStrength, 0, 1, 0.72)
 *   codex/core/pixelbrain/chestplate-bevel-amp.js:44  reads the clamped 1.0
 *
 * The tempting fixes are both wrong here. Widening the clamp changes a
 * rendering contract (`chestplate-bevel-amp` multiplies off the value);
 * throwing would break every spec that currently leans on coercion; and
 * `hashItemSpec` is content-addressed, so any change to a normalized value
 * invalidates every stored packet identity at once. So this reports and the
 * author decides. Same discipline as `fidelity.palette` and `routeDiagnostics`
 * beside it, which are also read-only instruments on the same bundle.
 *
 * Deterministic and pure: no clock, no RNG, no I/O, no mutation of inputs.
 * Every array is sorted so two runs byte-diff clean.
 */

import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';
import { computeOutline } from './silhouette-composer.js';

export const SPEC_INTENT_REPORT_VERSION = 'spec-intent-report-v1';

/** Numeric fidelity knobs that `normalizeFidelity` clamps without saying so. */
const FIDELITY_NUMERIC = Object.freeze([
  Object.freeze({ field: 'bevelStrength', min: 0, max: 1 }),
  Object.freeze({ field: 'rimContrast', min: 0, max: 1 }),
  Object.freeze({ field: 'centralGlowContainment', min: 0, max: 1 }),
  Object.freeze({ field: 'paletteBudget', min: 8, max: 128, integer: true }),
]);

/**
 * Material-bearing slots on a part. Kept in sync by hand with
 * `collectMaterials` in item-spec.js, which is private; if that list grows,
 * this one must too, or a divergence goes unreported.
 */
const MATERIAL_SLOTS = Object.freeze([
  Object.freeze({ path: 'fill', label: 'fill' }),
  Object.freeze({ path: 'trim', label: 'trim' }),
  Object.freeze({ path: 'outline', label: 'outline' }),
  Object.freeze({ path: 'wrap', label: 'wrap' }),
  Object.freeze({ path: 'motif.core', label: 'motif.core' }),
  Object.freeze({ path: 'motif.glow', label: 'motif.glow' }),
]);

function _finite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function _slotValue(part, dotted) {
  let node = part;
  for (const seg of dotted.split('.')) {
    if (node == null || typeof node !== 'object') return null;
    node = node[seg];
  }
  return node && typeof node === 'object' ? node : null;
}

function _upcaseHex(color) {
  return typeof color === 'string' ? color.toUpperCase() : null;
}

/** Every color a material can produce, across its declared anchors. */
function _materialColors(material) {
  const def = MATERIAL_PALETTES[resolveMaterialId(material)];
  if (!def || !def.anchors) return null;
  return new Set(Object.values(def.anchors).map(_upcaseHex).filter(Boolean));
}

// ─── 1. Silent numeric coercion ─────────────────────────────────────────────

/**
 * Fidelity fields the author wrote one value for and the foundry used another.
 * @param {object} rawSpec  spec as authored, before normalizeItemSpec
 * @param {object} spec     normalized spec actually used by the passes
 */
export function collectFidelityClamps(rawSpec, spec) {
  const authored = rawSpec?.fidelity || {};
  const effective = spec?.fidelity || {};
  const out = [];
  for (const { field, min, max, integer } of FIDELITY_NUMERIC) {
    if (!(field in authored)) continue;
    const a = _finite(authored[field]);
    const e = _finite(effective[field]);
    if (a === null || e === null || a === e) continue;
    out.push(Object.freeze({
      field,
      authored: a,
      effective: e,
      declaredRange: [min, max],
      cause: a > max ? 'above-declared-max' : a < min ? 'below-declared-min' : integer ? 'rounded-to-integer' : 'coerced',
    }));
  }
  return Object.freeze(out);
}

// ─── 2. Silently substituted material anchors ───────────────────────────────

/**
 * `{ material, anchor }` pairs where the named material has no such anchor and
 * the resolver quietly falls back to `body` (item-foundry.js:90-92).
 * A declared anchor that does not exist is a typo the author cannot see.
 */
export function collectAnchorSubstitutions(spec) {
  const out = [];
  for (const part of spec?.parts || []) {
    if (!part || typeof part !== 'object') continue;
    for (const { path, label } of MATERIAL_SLOTS) {
      const slot = _slotValue(part, path);
      if (!slot || !slot.material) continue;
      const id = resolveMaterialId(slot.material);
      const def = MATERIAL_PALETTES[id];
      if (!def || !slot.anchor) continue;
      if (def.anchors?.[slot.anchor]) continue; // honour as written
      out.push(Object.freeze({
        partId: part.id ?? null,
        slot: label,
        material: slot.material,
        declaredAnchor: slot.anchor,
        effectiveAnchor: def.anchors?.body ? 'body' : null,
        availableAnchors: Object.freeze(Object.keys(def.anchors || {}).sort()),
      }));
    }
  }
  return Object.freeze(out);
}

// ─── 3. Did the declared outline land on the silhouette? ────────────────────

/**
 * The audit's outline finding is a question of *ownership*, not of color math:
 * a part can only put its `outline.material` on border cells that belong to it.
 * `outline: { material:'void_gold' }` on a part that owns three border pixels
 * cannot make the asset's outer silhouette gold, no matter how correct the
 * material is. This measures who really owns the border.
 *
 * NOTE: `selout-amp.js:27-31` deliberately re-anchors rim colors by light
 * direction, so a part keeping only some of its expected colors is NORMAL and
 * is not reported as a problem. Only a declared outline that lands on nothing
 * is flagged.
 *
 * @param {object} params
 * @param {object} params.spec      normalized spec
 * @param {object} params.fills     final fills ({ coordinates: [{x,y,color,partId,isRim}] })
 * @param {object} params.silhouette silhouette ({ cells }) used for the border set
 */
export function collectOutlineIntent({ spec, fills, silhouette }) {
  const cells = fills?.coordinates || [];
  const borderKeys = silhouette?.cells ? computeOutline(silhouette) : new Set();
  const byPart = new Map();

  for (const cell of cells) {
    if (!cell || typeof cell !== 'object') continue;
    const key = `${Math.round(cell.x)},${Math.round(cell.y)}`;
    if (!borderKeys.has(key)) continue;
    const partId = cell.partId ?? '(none)';
    if (!byPart.has(partId)) byPart.set(partId, { total: 0, colors: new Set() });
    const bucket = byPart.get(partId);
    bucket.total += 1;
    const hex = _upcaseHex(cell.color);
    if (hex) bucket.colors.add(hex);
  }

  const borderTotal = [...byPart.values()].reduce((n, b) => n + b.total, 0);

  const ownership = Object.freeze([...byPart.entries()]
    .map(([partId, bucket]) => {
      const part = (spec?.parts || []).find((p) => p.id === partId) || null;
      return Object.freeze({
        partId,
        borderCells: bucket.total,
        shareOfBorder: borderTotal ? Math.round((bucket.total / borderTotal) * 1000) / 1000 : 0,
        declaredOutlineMaterial: part?.outline?.material ?? null,
        observedColors: Object.freeze([...bucket.colors].sort()),
      });
    })
    .sort((a, b) => (b.borderCells - a.borderCells) || String(a.partId).localeCompare(String(b.partId))));

  const declared = Object.freeze((spec?.parts || [])
    .filter((p) => p?.outline?.material)
    .map((part) => {
      const bucket = byPart.get(part.id);
      const expected = _materialColors(part.outline.material);
      const onBorder = bucket?.total ?? 0;
      const matched = bucket ? [...bucket.colors].filter((c) => expected?.has(c)).length : 0;
      let status;
      if (!expected) status = 'material-not-in-registry';
      else if (onBorder === 0) status = 'declared-outline-never-on-border';
      else if (matched === 0) status = 'declared-material-absent-from-own-border-cells';
      else status = 'honoured';
      return Object.freeze({
        partId: part.id ?? null,
        material: part.outline.material,
        anchor: part.outline.anchor ?? null,
        borderCells: onBorder,
        shareOfBorder: borderTotal ? Math.round((onBorder / borderTotal) * 1000) / 1000 : 0,
        distinctBorderColors: Object.freeze(bucket ? [...bucket.colors].sort() : []),
        materialColorsPresent: matched,
        status,
      });
    })
    .filter((entry) => entry.status !== 'honoured')
    .sort((a, b) => String(a.partId).localeCompare(String(b.partId))));

  return Object.freeze({
    borderCells: borderTotal,
    partsOwningBorder: ownership.length,
    ownership,
    /** Declared outlines that could not land where the author meant them to. */
    divergences: declared,
  });
}

// ─── 4. Declared parts that produced nothing ────────────────────────────────

/**
 * A part block the author wrote that owns zero cells in the final fills is
 * invisible work: it survives in the spec, the hash and the editor, and
 * contributes nothing to the image.
 */
export function collectUnrenderedParts(spec, fills) {
  const seen = new Set();
  for (const cell of fills?.coordinates || []) {
    if (cell?.partId) seen.add(cell.partId);
  }
  return Object.freeze((spec?.parts || [])
    .map((p) => p?.id)
    .filter((id) => id && !seen.has(id))
    .sort()
    .map((id) => Object.freeze({ partId: id })));
}

// ─── Aggregate ──────────────────────────────────────────────────────────────

/**
 * The full report. Pure, additive, never mutates or re-derives anything.
 * @param {object} params
 * @param {object} params.rawSpec  spec as authored (pre-normalization)
 * @param {object} params.spec     normalized spec
 * @param {object} params.fills    final fills
 * @param {object} params.silhouette
 */
export function collectSpecIntent({ rawSpec, spec, fills, silhouette }) {
  const clamps = collectFidelityClamps(rawSpec, spec);
  const anchors = collectAnchorSubstitutions(spec);
  const outline = collectOutlineIntent({ spec, fills, silhouette });
  const unrendered = collectUnrenderedParts(spec, fills);
  const attentionCount =
    clamps.length + anchors.length + outline.divergences.length + unrendered.length;

  return Object.freeze({
    version: SPEC_INTENT_REPORT_VERSION,
    assetId: spec?.id ?? null,
    clamps,
    anchorSubstitutions: anchors,
    outline,
    unrenderedParts: unrendered,
    attentionCount,
    clean: attentionCount === 0,
  });
}

/** Human-readable rendering, one line per divergence. Returns '' when clean. */
export function formatSpecIntent(report, { indent = '  ' } = {}) {
  const lines = [];
  for (const c of report.clamps) {
    lines.push(`${indent}! fidelity.${c.field}: authored ${c.authored}, foundry used ${c.effective} (${c.cause}; declared range ${c.declaredRange[0]}..${c.declaredRange[1]})`);
  }
  for (const a of report.anchorSubstitutions) {
    lines.push(`${indent}! ${a.partId}.${a.slot}: anchor '${a.declaredAnchor}' is not an anchor of '${a.material}' — resolved at '${a.effectiveAnchor}' (available: ${a.availableAnchors.join(', ')})`);
  }
  for (const o of report.outline.divergences) {
    if (o.status === 'declared-outline-never-on-border') {
      lines.push(`${indent}! ${o.partId}.outline: '${o.material}' declared but this part owns 0 of ${report.outline.borderCells} border cells — it cannot shape the silhouette`);
    } else if (o.status === 'declared-material-absent-from-own-border-cells') {
      lines.push(`${indent}! ${o.partId}.outline: '${o.material}' declared; none of its colors survive on this part's ${o.borderCells} border cell(s) — observed ${o.distinctBorderColors.join(' ') || '(none)'}`);
    } else {
      lines.push(`${indent}! ${o.partId}.outline: '${o.material}' — ${o.status}`);
    }
  }
  for (const u of report.unrenderedParts) {
    lines.push(`${indent}! part '${u.partId}' authored with no rendered cells`);
  }
  return lines.join('\n');
}

export default {
  SPEC_INTENT_REPORT_VERSION,
  collectFidelityClamps,
  collectAnchorSubstitutions,
  collectOutlineIntent,
  collectUnrenderedParts,
  collectSpecIntent,
  formatSpecIntent,
};
