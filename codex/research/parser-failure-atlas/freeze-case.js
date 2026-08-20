/**
 * Freeze one atlas case. Location, not a proposed fix.
 *
 * @module codex/research/parser-failure-atlas/freeze-case
 */

import { createHash } from 'node:crypto';
import { frontierSignature } from '../../core/constellation/failure-diagnosis.js';
import { ATLAS_CONTRACT, LEFTOVER_TYPES, plateOf } from './atlas-schema.js';

function sha16(text) {
  return createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}

function leftoverTypesOf(chart, plate) {
  const spanning = chart?.spanning || [];
  const types = [...new Set(spanning.map((m) => m.type).filter(Boolean))].sort();
  if (plate === 'ROOT_TYPE_MISMATCH') return types;
  return types.filter((t) => LEFTOVER_TYPES.includes(t));
}

export function freezeFailure(row) {
  const plate = plateOf(row);
  const record = row.record || {};
  const tokens = (record.tokens || []).map((t) => t.form);
  const text = record.text || tokens.join(' ');
  const sentId = record.sentId || null;
  const caseId = `pfa-${sha16(JSON.stringify({
    contract: ATLAS_CONTRACT,
    split: row.split,
    sentId,
    text,
    plate,
  }))}`;

  const molecules = row.chart?.molecules || [];
  return Object.freeze({
    caseId,
    split: row.split,
    sentId,
    text,
    tokens: Object.freeze(tokens),
    gold: Object.freeze({ ...(row.gold || {}) }),
    plate,
    diagnosis: Object.freeze({
      outcome: row.diagnosis?.outcome ?? null,
      overGenerated: Boolean(row.diagnosis?.overGenerated),
      categories: Object.freeze([...(row.diagnosis?.categories || [])].map((c) => Object.freeze({ ...c }))),
      nonProjective: row.diagnosis?.nonProjective ?? 0,
    }),
    chart: Object.freeze({
      spanningTypes: Object.freeze([...(new Set((row.chart?.spanning || []).map((m) => m.type)))].sort()),
      stableTypes: Object.freeze([...(new Set((row.chart?.stable || []).map((m) => m.type)))].sort()),
      moleculeCount: molecules.length,
      frontierSignature: frontierSignature({ molecules }, tokens.length),
      leftoverTypes: Object.freeze(leftoverTypesOf(row.chart, plate)),
    }),
    metrics: Object.freeze({
      contained: row.contained === true,
      decided: row.decided,
    }),
    versions: Object.freeze({
      packetContract: ATLAS_CONTRACT,
      composer: 'compose-packed',
      diagnosis: 'failure-diagnosis',
      corpus: 'ud-en-ewt',
    }),
  });
}
