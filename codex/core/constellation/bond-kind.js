/**
 * BOND REACTION KINDS
 *
 * Natural grammar needs category-preserving rules. They are also the rules
 * capable of recursive derivational pressure. The architecture names them so
 * a microscope does not have to rediscover the distinction in an autopsy.
 *
 *   CONSTRUCTIVE            N + VP → S     a new type appears
 *   LIFTING                 N → NP         unary promotion
 *   PRESERVATIVE            ADJ + N → N    output is an input type, not a clause
 *   RECURSIVE_PRESERVATIVE  ADV + S → S    output is an input type, and that
 *                                          type is clause material that feeds
 *                                          more clause-adjunct bonds
 *
 * LAW: Lexical ambiguity may increase alternative derivations, but must not
 * create new recursive privileges solely through category lifting.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/bond-kind
 */

export const BOND_REACTION = Object.freeze({
  CONSTRUCTIVE: 'constructive',
  LIFTING: 'lifting',
  PRESERVATIVE: 'preservative',
  RECURSIVE_PRESERVATIVE: 'recursive-preservative',
});

export function classifyBond(bond) {
  const left = bond[0];
  const right = bond[1];
  const result = bond[2];
  if (result !== left && result !== right) return BOND_REACTION.CONSTRUCTIVE;
  if (result === 'S') return BOND_REACTION.RECURSIVE_PRESERVATIVE;
  return BOND_REACTION.PRESERVATIVE;
}

export function classifyLift(_lift) {
  return BOND_REACTION.LIFTING;
}

function emptyCensus() {
  return {
    constructive: 0,
    preservative: 0,
    recursivePreservative: 0,
    lifting: 0,
    liftAfterPreservation: 0,
    preservationToClauseCycles: 0,
    total: 0,
    bySignature: Object.create(null),
  };
}

function bumpSignature(census, signature, kind) {
  const row = census.bySignature[signature] || { kind, n: 0 };
  row.n += 1;
  census.bySignature[signature] = row;
}

function isPreservativeDerivation(d) {
  return Boolean(d && d.bond && classifyBond(d.bond) === BOND_REACTION.PRESERVATIVE);
}

/**
 * Walk a packed cell and count every recorded derivation by reaction kind.
 * Lift-after-preservation: a lift whose child was built by a preservative bond.
 * Preservation→lift→clause: a recursive-preservative firing whose clause
 * child contains a constructive NP+VP whose NP was lifted off a preservative N.
 */
export function censusReactions(cell) {
  const census = emptyCensus();
  if (!cell) return census;

  for (const row of cell) {
    for (const map of row) {
      for (const node of map.values()) {
        for (const d of node.derivations) {
          census.total += 1;
          if (d.lift) {
            census.lifting += 1;
            bumpSignature(census, `LIFT ${d.child.type}->${node.type}`, BOND_REACTION.LIFTING);
            const childBuiltByPreservation = (d.child.derivations || []).some(isPreservativeDerivation);
            if (childBuiltByPreservation) census.liftAfterPreservation += 1;
            continue;
          }
          if (!d.bond) continue;
          const kind = classifyBond(d.bond);
          const sig = `${d.bond[0]}+${d.bond[1]}->${d.bond[2]}`;
          bumpSignature(census, sig, kind);
          if (kind === BOND_REACTION.CONSTRUCTIVE) census.constructive += 1;
          else if (kind === BOND_REACTION.PRESERVATIVE) census.preservative += 1;
          else if (kind === BOND_REACTION.RECURSIVE_PRESERVATIVE) {
            census.recursivePreservative += 1;
            if (feedsPreservationLiftClauseCycle(d)) census.preservationToClauseCycles += 1;
          }
        }
      }
    }
  }
  return census;
}

function feedsPreservationLiftClauseCycle(d) {
  const clause = d.bond[1] === 'S' ? d.right : d.bond[0] === 'S' ? d.left : null;
  if (!clause || !clause.derivations) return false;
  return clause.derivations.some((cd) => {
    if (!cd.bond) return false;
    if (cd.bond[0] !== 'NP' || cd.bond[1] !== 'VP' || cd.bond[2] !== 'S') return false;
    const np = cd.left;
    if (!np || np.type !== 'NP') return false;
    return (np.derivations || []).some((ld) => (
      ld.lift && ld.child && (ld.child.derivations || []).some(isPreservativeDerivation)
    ));
  });
}
