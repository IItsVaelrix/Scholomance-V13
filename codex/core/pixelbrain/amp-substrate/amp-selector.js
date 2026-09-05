/**
 * AMP selector — which AMPs a spec actually needs.
 *
 * Sparse activation, done deterministically: every registered relevance record
 * is evaluated against the spec, the matching AMPs activate, the rest stay
 * dormant, and BOTH lists come back — a skipped AMP always carries the reason it
 * was skipped, because "why didn't this run" is the question this substrate
 * exists to answer.
 *
 * There is no model here, no scoring, no ranking. `matchesClause` is three `if`
 * branches over plain values. That is deliberate and permanent: this pipeline's
 * determinism law (VAELRIX_LAW Law 6) is what makes lineage verification and the
 * Craft Gate meaningful, and a learned gate would trade that away for nothing
 * these predicates can't already express.
 *
 * The pattern is not invented here either — `codex/core/animation/amp/registry.ts`
 * already does exactly this with `selectForIntent(intent)`; this is that idea
 * over a persistent, checksummed store instead of an in-memory Map.
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-09-04-pixelbrain-amp-activation-substrate-v1-pdr.md
 */

import { sha256Hex } from '../sha256.js';
import { appendActivationLog } from './amp-substrate.db.js';

export const SELECTOR_VERSION = '1.0.0';

/**
 * Read a dotted path off a spec. A path whose first segment holds an array
 * (`parts.profile`) fans out: it returns EVERY element's value at the remaining
 * path, which is what makes "some part has this profile" expressible — the shape
 * real gates already use (`spec.parts.some(p => p.profile === ...)`).
 *
 * @returns {{ values: unknown[], fanned: boolean }}
 */
function readPath(spec, path) {
  const segments = path.split('.');
  let current = [spec];
  let fanned = false;

  for (const segment of segments) {
    const next = [];
    for (const node of current) {
      if (node === null || node === undefined) continue;
      if (Array.isArray(node)) {
        fanned = true;
        for (const element of node) {
          if (element !== null && element !== undefined) next.push(element[segment]);
        }
      } else {
        next.push(node[segment]);
      }
    }
    current = next;
  }

  return { values: current.filter((v) => v !== undefined), fanned };
}

function satisfiesOp(actual, op, value) {
  const candidates = Array.isArray(value) ? value : [value];

  if (op === 'eq') {
    if (Array.isArray(actual)) return actual.some((a) => candidates.includes(a));
    return candidates.includes(actual);
  }
  if (op === 'includes') {
    if (Array.isArray(actual)) return actual.some((a) => candidates.includes(a));
    const text = String(actual ?? '').toLowerCase();
    return candidates.some((c) => text.includes(String(c).toLowerCase()));
  }
  if (op === 'matches') {
    // `matches` is deliberately literal and whole-value. Relevance records are
    // data authored outside this process, so compiling their values as regular
    // expressions would make one record capable of turning a selector query
    // into unbounded regex work. `includes` is the deliberately fuzzy operator;
    // `matches` is the exact counterpart for punctuation-bearing identifiers.
    return candidates.includes(String(actual ?? ''));
  }
  // Unknown op never matches. An unrecognised predicate must not silently
  // activate an AMP — refusing to match is the safe direction.
  return false;
}

function matchesLeaf(spec, clause) {
  const { values } = readPath(spec, clause.field);
  if (values.length === 0) return false;
  return values.some((actual) => satisfiesOp(actual, clause.op, clause.value));
}

function matchesClause(spec, clause) {
  if (clause && Array.isArray(clause.anyOf)) {
    return clause.anyOf.some((sub) => matchesLeaf(spec, sub));
  }
  return matchesLeaf(spec, clause);
}

/** A required path is satisfied when it resolves to at least one real value. */
function satisfiesRequires(spec, requires) {
  for (const path of requires) {
    const { values } = readPath(spec, path);
    const present = values.some((v) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
    if (!present) return { ok: false, missing: path };
  }
  return { ok: true, missing: null };
}

/**
 * Decide which AMPs a spec activates.
 *
 * Pure: same spec + same records in, byte-identical result out. Records are
 * evaluated in ampId order so the returned arrays never depend on row order,
 * Map iteration, or insertion history. Activated results are sorted by `order`.
 *
 * @param {string} pipeline - the pipeline to scope to (e.g. 'item', 'cross-cutting')
 * @param {object} spec - an ITEM-SPEC-v1 / CHARACTER-SPEC-v1 shaped object
 * @param {Array<{pipeline:string, ampId:string, order:number, appliesToJson:string, requiresJson:string}>} records
 * @returns {{ activated: string[], skipped: Array<{ampId:string, reason:string}>,
 *   specChecksum: string, selectorVersion: string, pipeline: string }}
 */
export function selectActiveAmps(pipeline, spec, records) {
  const scoped = (records ?? []).filter((r) => r.pipeline === pipeline);
  const activatedRecords = [];
  const skipped = [];

  const ordered = [...scoped].sort((a, b) => a.ampId.localeCompare(b.ampId));

  for (const record of ordered) {
    const appliesTo = JSON.parse(record.appliesToJson || '[]');
    const requires = JSON.parse(record.requiresJson || '[]');

    const required = satisfiesRequires(spec, requires);
    if (!required.ok) {
      skipped.push({ ampId: record.ampId, reason: `requires '${required.missing}', absent from spec` });
      continue;
    }

    // Empty appliesTo means universally relevant — the correct shape for a pass
    // like symmetry-amp, not a missing predicate.
    const matched = appliesTo.length === 0 || appliesTo.every((clause) => matchesClause(spec, clause));
    if (matched) activatedRecords.push(record);
    else skipped.push({ ampId: record.ampId, reason: 'appliesTo did not match spec' });
  }

  activatedRecords.sort((a, b) => a.order - b.order);

  return {
    activated: activatedRecords.map((r) => r.ampId),
    skipped,
    specChecksum: sha256Hex(JSON.stringify(spec ?? null)),
    selectorVersion: SELECTOR_VERSION,
    pipeline,
  };
}

/**
 * `selectActiveAmps` against a live substrate, recording the decision.
 * The pure function above stays independently testable; this is the one that
 * leaves an audit trail.
 */
export async function selectAndLog(db, pipeline, spec, records) {
  const result = selectActiveAmps(pipeline, spec, records);
  await appendActivationLog(db, {
    specChecksum: result.specChecksum,
    activated: result.activated,
    skipped: result.skipped,
    selectorVersion: result.selectorVersion,
  });
  return result;
}
