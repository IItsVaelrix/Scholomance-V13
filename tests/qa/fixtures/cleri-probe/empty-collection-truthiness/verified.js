// EMPTY_COLLECTION_TRUTHINESS — verified positive fixtures

// subtype: REAL_WORLD_POSITIVE
// A lexicon that answers "I have no tags for this word" with an empty array.
// Line 11 proves the author expects that; line 12 forgot, so the unknown-word
// escape hatch cannot fire for any word the lexicon knows but cannot type.
//
// `known.forEach` is what proves `known` is a collection. The `? known : []`
// unification on line 11 does NOT: a string satisfies it too, and treating it
// as proof convicted a correct `!text` check on a string parameter.
function atomsFor(token, index, posMap) {
  const known = posMap.get(token);
  const out = [];
  if (known && known.length > 0) known.forEach(tag => out.push(tag));
  if (index > 0 && !known) out.push('PROPN');
  return out;
}

// subtype: CLEAR_POSITIVE
// The note is meant to record "the search came back with nothing", so a query
// that matched no candidate is reported as if it had matched some.
function rankCandidates(query, index) {
  const matches = index.lookup(query);
  const scored = matches.map(match => match.score);
  const ranked = matches.length >= 3 ? scored : scored.slice(0, 1);
  const notes = [];
  if (!matches && query.length > 2) {
    notes.push('no candidate survived retrieval');
  }
  return { ranked, notes };
}
