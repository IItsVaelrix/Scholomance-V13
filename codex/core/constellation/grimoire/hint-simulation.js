/**
 * HINT SIMULATION — discover bonds our table *implies* but does not state.
 *
 * Sources of hints (pattern completion, not free-C search):
 *   1. Punct-absorb parity: if H+PUNCT→H for some heads, propose for siblings
 *   2. Coordination parity: CONJ+X / X+CONJX for more phrase types
 *   3. Modifier symmetry / host extension
 *   4. Pure-noun (NC) ports: every law on N that should also see NC
 *   5. Lift-completion: missing LIFTS implied by phrase inventory
 *   6. Result-conservation pair table rows not yet in BONDS
 *
 * Every candidate must pass conservesResult OR be an explicit named special.
 *
 * @module codex/core/constellation/grimoire/hint-simulation
 */

import { BONDS, LIFTS } from '../compose.js';
import {
  conservesResult,
  CONSTRUCTION_SCHEMAS,
  synthesizeByProjection,
} from './projection-laws.js';

function bondKey(l, r, res) {
  return `${l}|${r}|${res}`;
}

function activeSignatures() {
  return new Set(BONDS.map((b) => bondKey(b[0], b[1], b[2])));
}

function activePairs() {
  return new Set(BONDS.map((b) => `${b[0]}+${b[1]}`));
}

/**
 * Build the hint slate: candidates implied by current laws but missing from BONDS.
 * @returns {Array<object>}
 */
export function buildHintSlate() {
  const have = activeSignatures();
  const havePair = activePairs();
  const out = new Map(); // signature|head -> candidate

  const add = (c) => {
    if (!c || !c.left || !c.right || !c.result) return;
    if (c.head !== 0 && c.head !== 1) return;
    const signature = bondKey(c.left, c.right, c.result);
    if (have.has(signature)) return;
    const check = conservesResult({
      left: c.left, right: c.right, result: c.result, head: c.head,
    });
    // Named specials from CONSTRUCTION_SCHEMAS / explicit special flag skip generic fail
    if (!check.ok && !c.special) return;
    if (!check.ok && c.special) {
      // still require not already present
    } else if (check.ok) {
      c = { ...c, ...check.derived, hint: c.hint || check.derived.law };
    }
    const k = `${signature}|${c.head}`;
    if (out.has(k)) return;
    out.set(k, {
      left: c.left,
      right: c.right,
      result: c.result,
      head: c.head,
      signature,
      law: c.law || c.hint || 'hint',
      hint: c.hint || c.law || 'hint',
      special: Boolean(c.special),
    });
  };

  // ── 1. Punct-absorb parity ─────────────────────────────────────────────
  // We already absorb on S, NP, ADJ. Projection licenses VP, PP. Also N, NC, SBAR.
  for (const head of ['VP', 'PP', 'N', 'NC', 'SBAR', 'INF', 'RELC', 'PART']) {
    add({
      left: head, right: 'PUNCT', result: head, head: 0,
      special: true,
      hint: `punct-parity:${head}`,
      law: `hint:punct-parity`,
    });
  }

  // ── 2. Coordination parity for ADJ / PP / ADJ-like ───────────────────
  const coordTypes = [
    { X: 'ADJ', bridge: 'CONJADJ' },
    { X: 'PP', bridge: 'CONJPP' },
    { X: 'ADV', bridge: 'CONJADV' },
    { X: 'N', bridge: 'CONJN' },
    { X: 'NC', bridge: 'CONJNC' },
  ];
  for (const { X, bridge } of coordTypes) {
    add({
      left: 'CONJ', right: X, result: bridge, head: 1,
      special: true, hint: `coord-bridge:${X}`, law: 'hint:coord-parity',
    });
    add({
      left: X, right: bridge, result: X, head: 0,
      special: true, hint: `coord-complete:${X}`, law: 'hint:coord-parity',
    });
  }

  // ── 3. NC ports: every active bond on N that should accept NC ─────────
  for (const b of BONDS) {
    const [l, r, res, h] = b;
    if (l === 'N' && r !== 'N') {
      add({
        left: 'NC', right: r, result: res, head: h,
        special: true, hint: `nc-port-left:${bondKey(l, r, res)}`, law: 'hint:nc-port',
      });
    }
    if (r === 'N' && l !== 'N') {
      add({
        left: l, right: 'NC', result: res === 'N' ? 'N' : res, head: h,
        special: true, hint: `nc-port-right:${bondKey(l, r, res)}`, law: 'hint:nc-port',
      });
      // ADJ+NC→N stack like ADJ+N→N
      if (l === 'ADJ' && res === 'N') {
        add({
          left: 'ADJ', right: 'NC', result: 'NC', head: 1,
          special: true, hint: 'adj-nc-stack', law: 'hint:nc-port',
        });
      }
      if (l === 'DET' && res === 'NP') {
        add({
          left: 'DET', right: 'NC', result: 'NP', head: 1,
          special: true, hint: 'det-nc', law: 'hint:nc-port',
        });
      }
      if (l === 'POSS' && res === 'N') {
        add({
          left: 'POSS', right: 'NC', result: 'NC', head: 1,
          special: true, hint: 'poss-nc', law: 'hint:nc-port',
        });
      }
      if (l === 'GEN' && res === 'NP') {
        add({
          left: 'GEN', right: 'NC', result: 'NP', head: 1,
          special: true, hint: 'gen-nc', law: 'hint:nc-port',
        });
      }
    }
  }

  // ── 4. Projection table rows not in BONDS ──────────────────────────────
  for (const c of synthesizeByProjection()) {
    if (have.has(c.signature)) continue;
    add({ ...c, hint: `projection-extra:${c.law}`, law: c.law });
  }

  // ── 5. Modifier / host extensions hinted by existing pairs ─────────────
  // We have NP+PP, VP+PP — clause-level PP adjunct
  add({
    left: 'S', right: 'PP', result: 'S', head: 0,
    special: true, hint: 'clause-pp-adjunct', law: 'hint:host-extension',
  });
  // We have ADV+S bare fronting — ADJ+S fragments?
  add({
    left: 'ADJ', right: 'S', result: 'S', head: 1,
    special: true, hint: 'adj-front-clause', law: 'hint:host-extension',
  });
  // Symmetric: S+ADV postposed
  add({
    left: 'S', right: 'ADV', result: 'S', head: 0,
    special: true, hint: 'clause-adv-post', law: 'hint:host-extension',
  });
  // VP+SBAR if V+SBAR exists (host extension to VP)
  if (havePair.has('V+SBAR') && !havePair.has('VP+SBAR')) {
    add({
      left: 'VP', right: 'SBAR', result: 'VP', head: 0,
      special: true, hint: 'vp-sbar', law: 'hint:host-extension',
    });
  }
  // VP+INF parallel V+INF
  if (havePair.has('V+INF') && !havePair.has('VP+INF')) {
    add({
      left: 'VP', right: 'INF', result: 'VP', head: 0,
      special: true, hint: 'vp-inf', law: 'hint:host-extension',
    });
  }
  // N+PP after NC→N — NC+PP
  add({
    left: 'NC', right: 'PP', result: 'NP', head: 0,
    special: true, hint: 'nc-pp', law: 'hint:nc-port',
  });
  add({
    left: 'N', right: 'PP', result: 'NP', head: 0,
    special: true, hint: 'n-pp', law: 'hint:host-extension',
  });
  // DET+NP residual (from gap sim)
  add({
    left: 'DET', right: 'NP', result: 'NP', head: 1,
    special: true, hint: 'det-np', law: 'hint:host-extension',
  });
  // NUM-like: already ADJ path. PRT on N?
  // AUX+ADJ for "is happy" is COP+ADJ — skip
  // Relative: REL+ADJ? no

  // ── 6. Missing LIFTS hinted by inventory ───────────────────────────────
  // (handled separately in simulation as lift candidates if needed)
  const liftSet = new Set(LIFTS.map(([a, b]) => `${a}>${b}`));
  const liftHints = [];
  if (!liftSet.has('NC>NP')) {
    // NC→N→NP already; optional shortcut NC→NP
    liftHints.push({ src: 'NC', dst: 'NP', hint: 'lift-nc-np' });
  }
  if (!liftSet.has('ADJ>NP')) {
    liftHints.push({ src: 'ADJ', dst: 'NP', hint: 'lift-adj-np' }); // predicative fragments
  }

  // ── 7. Construction schemas not yet in BONDS ───────────────────────────
  for (const s of CONSTRUCTION_SCHEMAS) {
    const signature = bondKey(s.left, s.right, s.result);
    if (have.has(signature)) continue;
    add({
      left: s.left, right: s.right, result: s.result, head: s.head,
      special: true, hint: `schema:${s.construction}`, law: `construction:${s.construction}`,
    });
  }

  // Prefer Result Conservation; allow named hint specials (new bridges etc.)
  const candidates = [...out.values()].filter((c) => {
    if (conservesResult(c).ok) return true;
    if (!c.special) return false;
    const h = c.hint || '';
    return (
      h.startsWith('coord')
      || h.startsWith('punct')
      || h.startsWith('nc-port')
      || h.startsWith('host-extension')
      || h.startsWith('det-')
      || h.startsWith('adj-')
      || h.startsWith('poss-')
      || h.startsWith('gen-')
      || h.startsWith('n-pp')
      || h.startsWith('nc-pp')
      || h.startsWith('clause-')
      || h.startsWith('vp-')
      || h.startsWith('schema:')
      || h.startsWith('projection-extra')
    );
  });

  return {
    candidates: candidates.sort((a, b) => a.signature.localeCompare(b.signature)),
    liftHints,
  };
}
