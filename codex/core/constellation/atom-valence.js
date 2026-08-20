/**
 * TYPED VALENCE
 *
 * Vacancies are missing structural requirements, not empty token slots and
 * not a bonus score. Each role has a direction and the types it accepts.
 *
 * PHYSICS:          chemical valence / coordination number
 * SEMANTIC ANALOG:  typed holes a category still needs
 * STATE:            atom.valence.roles[role] = {dir, accept, capacity, filled}
 * OPERATOR:         mint on create; fill when a licensed bond consumes the role
 * CANNOT:           invent a bond; raise ranking; replace the Grimoire
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/atom-valence
 */

export const ATOM_VALENCE_CONTRACT = 'PB-ATOM-VALENCE-v1';

export const ATOM_VALENCE = Object.freeze({
  DET: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['N', 'NP']), capacity: 1 }),
  }),
  P: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['N', 'NP']), capacity: 1 }),
  }),
  POSS: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['N', 'NP']), capacity: 1 }),
  }),
  V: Object.freeze({
    subject: Object.freeze({ dir: 'left', accept: Object.freeze(['NP', 'N', 'PRON']), capacity: 1 }),
    object: Object.freeze({ dir: 'right', accept: Object.freeze(['NP', 'N', 'PRON']), capacity: 1 }),
  }),
  VP: Object.freeze({
    subject: Object.freeze({ dir: 'left', accept: Object.freeze(['NP', 'N', 'PRON']), capacity: 1 }),
  }),
  AUX: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['VP', 'V']), capacity: 1 }),
  }),
  MODAL: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['VP', 'V']), capacity: 1 }),
  }),
  COP: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['ADJ', 'NP', 'N']), capacity: 1 }),
  }),
  TO: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['VP', 'V']), capacity: 1 }),
  }),
  SUB: Object.freeze({
    complement: Object.freeze({ dir: 'right', accept: Object.freeze(['S', 'NP']), capacity: 1 }),
  }),
});

const SEEKING_ROLES = Object.freeze(['complement', 'object']);

export function mintValence(type) {
  const spec = ATOM_VALENCE[type];
  const roles = Object.create(null);
  if (spec) {
    for (const [role, slot] of Object.entries(spec)) {
      roles[role] = {
        dir: slot.dir,
        accept: slot.accept,
        capacity: slot.capacity,
        filled: 0,
      };
    }
  }
  return { roles };
}

export function openVacancies(valence) {
  if (!valence?.roles) return [];
  const open = [];
  for (const [role, slot] of Object.entries(valence.roles)) {
    if ((slot.filled || 0) < (slot.capacity || 0)) {
      open.push({ role, dir: slot.dir, accept: slot.accept });
    }
  }
  return open;
}

export function fillValence(valence, role) {
  const slot = valence?.roles?.[role];
  if (!slot) return false;
  if ((slot.filled || 0) >= (slot.capacity || 0)) return false;
  slot.filled += 1;
  return true;
}

function seekingRole(type) {
  const spec = ATOM_VALENCE[type];
  if (!spec) return null;
  for (const role of SEEKING_ROLES) {
    if (spec[role]) return spec[role].dir;
  }
  return null;
}

export const seekingByType = Object.freeze(
  Object.fromEntries(
    Object.keys(ATOM_VALENCE)
      .map((type) => [type, seekingRole(type)])
      .filter(([, dir]) => dir),
  ),
);

function tryFill(atom, other) {
  if (!atom?.valence || !other) return;
  const otherOnRight = (other.from ?? 0) > (atom.from ?? 0);
  for (const hole of openVacancies(atom.valence)) {
    const faces = hole.dir === 'right' ? otherOnRight : !otherOnRight;
    if (!faces) continue;
    if (!(hole.accept || []).includes(other.type)) continue;
    fillValence(atom.valence, hole.role);
    return;
  }
}

/** Fill typed holes that this licensed pair actually faces. */
export function consumeBondValence(left, right) {
  tryFill(left, right);
  tryFill(right, left);
}
