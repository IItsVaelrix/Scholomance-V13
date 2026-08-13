// EMPTY_COLLECTION_TRUTHINESS — hard-negative fixtures
// Every shape here was measured in the repository first: these are the four
// ways a bare negation next to a length test is correct code.

// subtype: DIRECT_HARD_NEGATIVE
// The negation bails out on a missing result and the empty case is handled
// immediately after it. Both questions are asked, and each one is asked right.
function loadRows(source) {
  const rows = source.query();
  if (!rows) return null;
  if (rows.length === 0) return [];
  return rows.map(row => row.value);
}

// subtype: ADVERSARIAL_HARD_NEGATIVE
// `!text` is the correct emptiness test for a string: '' is falsy. The `.length`
// read next to it is exactly the shape a collection would show.
function summarize(text) {
  if (!text && text.length !== 0) return '';
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

// subtype: ADVERSARIAL_HARD_NEGATIVE
// The negation and the size test live in one expression, so the empty case is
// covered by the guard that carries it.
function applyChaikin(points) {
  if (!points || points.length < 3) return points ? [...points] : [];
  return points.map(point => ({ ...point }));
}

// subtype: ADVERSARIAL_HARD_NEGATIVE
// Measured in codex/core/modulation/planner/formula-validator.js. `child` is a
// plain object with a field called `size`, and the verifier read that field as
// proof of a Map until this shape was swept. A domain field is not a type.
function validateChild(child, index, errors) {
  if (!child || typeof child !== 'object') {
    errors.push(`children[${index}] must be an object`);
    return;
  }
  if (child.size !== undefined && child.size.w > 0) {
    errors.push(`children[${index}].size is out of range`);
  }
}

// subtype: DIRECT_HARD_NEGATIVE
// A bail-out that records why before it leaves. The branch still cannot be
// reached by an empty array, and it is still the correct nullish guard.
function collectRows(source, errors) {
  const rows = source.query();
  if (!rows) {
    errors.push('the source returned no rows at all');
    return [];
  }
  return rows.length > 0 ? rows.map(row => row.value) : [];
}

// subtype: DIRECT_HARD_NEGATIVE
// The repaired shape: ask the collection about its length, through the optional
// chain that also answers the missing case.
function atomsForRepaired(token, index, posMap) {
  const known = posMap.get(token);
  const tags = known && known.length > 0 ? known : [];
  const out = [...tags];
  if (index > 0 && !known?.length) out.push('PROPN');
  return out;
}
