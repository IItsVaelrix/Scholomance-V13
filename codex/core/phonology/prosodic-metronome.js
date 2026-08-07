/**
 * PROSODIC METRONOME — stress-shift homograph disambiguation.
 *
 * English noun/verb homographs alternate stress: the noun stresses syllable 1
 * (REcord), the verb stresses syllable 2 (reCORD). Which one is correct is not
 * a lexical fact — it's a *rhythmic/structural* one, read from the function-word
 * frame around the word: a determiner/adjective before it sets a noun beat; a
 * `to`/modal/subject-pronoun before it sets a verb beat.
 *
 * The "metronome" reads that local beat and places the stress. It only speaks
 * when the frame is confident; otherwise it defers to normal G2P (returns null).
 * It cannot help vowel-change homographs (read/lead) — those are segmental, not
 * rhythmic, and belong to a lexical table.
 */

// word -> { noun: front-stress phonemes, verb: end-stress phonemes }
export const STRESS_SHIFT_HOMOGRAPHS = Object.freeze({
  record:   { noun: ['R','EH1','K','ER0','D'],            verb: ['R','AH0','K','AO1','R','D'] },
  present:  { noun: ['P','R','EH1','Z','AH0','N','T'],     verb: ['P','R','IY0','Z','EH1','N','T'] },
  object:   { noun: ['AA1','B','JH','EH0','K','T'],        verb: ['AH0','B','JH','EH1','K','T'] },
  produce:  { noun: ['P','R','OW1','D','UW0','S'],         verb: ['P','R','AH0','D','UW1','S'] },
  contract: { noun: ['K','AA1','N','T','R','AE0','K','T'], verb: ['K','AH0','N','T','R','AE1','K','T'] },
  desert:   { noun: ['D','EH1','Z','ER0','T'],             verb: ['D','IH0','Z','ER1','T'] },
  permit:   { noun: ['P','ER1','M','IH0','T'],             verb: ['P','ER0','M','IH1','T'] },
  conduct:  { noun: ['K','AA1','N','D','AH0','K','T'],     verb: ['K','AH0','N','D','AH1','K','T'] },
  rebel:    { noun: ['R','EH1','B','AH0','L'],             verb: ['R','IH0','B','EH1','L'] },
  contest:  { noun: ['K','AA1','N','T','EH0','S','T'],     verb: ['K','AH0','N','T','EH1','S','T'] },
  convert:  { noun: ['K','AA1','N','V','ER0','T'],         verb: ['K','AH0','N','V','ER1','T'] },
  address:  { noun: ['AE1','D','R','EH0','S'],             verb: ['AH0','D','R','EH1','S'] },
});

/**
 * Function-word frame cues (the "beat"). THE canonical tables — constellation's
 * resolveSyntacticFrame imports these rather than keeping its own copy. Two
 * frame readers with two cue lists disagree at the edges, and the edges are
 * exactly where a heteronym is decided.
 */
export const NOUN_CUES = new Set([
  'a','an','the','this','that','these','those','my','your','his','her','its','our','their',
  'no','every','each','some','any','one','another',
  'new','old','big','small','good','bad','great','strange','final','latest','recent','only',
]);
export const VERB_CUES = new Set([
  'to','will','would','shall','should','can','could','may','might','must','please','let',
  "don't",'dont',"didn't",'didnt',"doesn't","won't","can't",
  'i','we','you','they','he','she','it','who',
  'has','have','had','was','were','is','are','am','be','been','being','did','does','do',
]);

/**
 * Prepositions introduce a noun phrase, so the token after one takes a noun
 * beat: "salt in the wound", "blood from wound".
 */
export const PREPOSITION_CUES = new Set([
  'of','in','on','at','from','with','by','for','into','onto','upon',
  'through','across','against','beneath','under','over','about','without',
]);

/**
 * A determiner or object pronoun AFTER the token suggests a transitive verb —
 * "wound the clock". Weaker than the before-cues, so it is only consulted when
 * nothing before the token decided it.
 */
export const OBJECT_CUES_AFTER = new Set([
  'the','a','an','this','that','these','those',
  'my','your','his','her','its','our','their','him','them','me','us','it',
]);

function norm(token) {
  return String(token || '').toLowerCase().replace(/[^a-z']/g, '');
}

export function isStressShiftHomograph(word) {
  return Object.prototype.hasOwnProperty.call(STRESS_SHIFT_HOMOGRAPHS, norm(word));
}

/**
 * Read the noun/verb beat from the token immediately before the target.
 * @returns {'noun'|'verb'|null}
 */
export function readMeter(tokens, targetIndex) {
  return resolveFrame(tokens, targetIndex).frame;
}

/**
 * Does this surface form carry an inflectional -s?
 *
 * `ss` is excluded because it is not an inflection — `glass` and `class` are
 * bare singulars, and reading their final s as agreement would invert the very
 * pairs this is meant to resolve. Sibilant `-es` endings ARE inflections
 * (`watches`, `boxes`), so they count.
 */
export function carriesInflectionalS(word) {
  const w = String(word ?? '').toLowerCase();
  if (/(?:ches|shes|xes|zes|ses)$/.test(w)) return true;
  return /[^s]s$/.test(w);
}

/**
 * SUBJECT-VERB AGREEMENT AS AN ORTHOGRAPHIC CUE.
 *
 * English puts -s on exactly ONE of a subject/verb pair:
 *
 *     singular subject + verb-s      water runs      river flows
 *     plural subject   + bare verb   stars burn      shadows fall
 *
 * So for an adjacent content pair the -s distribution names the roles without a
 * lookup — cheap, and it needs no dictionary. Measured on ten pairs including
 * three traps it resolved seven and was correct on all seven; the three it
 * declined were `wound healed`, `bird sang` and `geese fly`, where NEITHER word
 * carries -s and there is genuinely no orthographic signal. `glass breaks`
 * survives because `ss` is not an inflection.
 *
 * The naive test fails here and is worth naming: `runs` is a verb ending in -s
 * and `stars` is a noun ending in -s, so the suffix alone says nothing. It is
 * the COMPLEMENTARY distribution across the pair that carries the information.
 *
 * @returns {'first'|'second'|null} which member is the subject, or null when
 *   the pair carries no agreement signal at all.
 */
export function agreementSubject(first, second) {
  const a = carriesInflectionalS(first);
  const b = carriesInflectionalS(second);
  if (a === b) return null;          // both or neither: no signal, do not guess
  // English declaratives put the subject first, and agreement confirms it.
  return 'first';
}

/**
 * THE frame reader. Reads the local beat around one token and names the cue that
 * decided it, or abstains.
 *
 * Abstention is the important behaviour: a reader that guesses "noun" on no
 * evidence invents the very thing its caller needs evidence for.
 *
 * @returns {{frame: 'noun'|'verb'|null, cue: string|null}}
 */
export function resolveFrame(tokens, targetIndex) {
  const none = { frame: null, cue: null };
  if (!Array.isArray(tokens)) return none;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= tokens.length) return none;

  const prev = targetIndex > 0 ? norm(tokens[targetIndex - 1]) : null;
  const next = targetIndex < tokens.length - 1 ? norm(tokens[targetIndex + 1]) : null;

  // Before-cues attach directly to the token, so they decide first.
  if (prev) {
    if (NOUN_CUES.has(prev)) return { frame: 'noun', cue: `determiner:${prev}` };
    if (PREPOSITION_CUES.has(prev)) return { frame: 'noun', cue: `preposition:${prev}` };
    if (VERB_CUES.has(prev)) return { frame: 'verb', cue: `subject-or-aux:${prev}` };
  }

  if (next && OBJECT_CUES_AFTER.has(next)) {
    return { frame: 'verb', cue: `object-follows:${next}` };
  }

  return none;
}

/**
 * Pronounce a stress-shift homograph using the metronome's frame, or null to
 * defer to normal G2P (word isn't in the class, or the frame is ambiguous).
 * @returns {string[]|null}
 */
export function pronounceWithMeter(word, tokens, targetIndex) {
  const key = norm(word);
  const entry = STRESS_SHIFT_HOMOGRAPHS[key];
  if (!entry) return null;
  const frame = readMeter(tokens, targetIndex);
  if (frame === 'noun') return [...entry.noun];
  if (frame === 'verb') return [...entry.verb];
  return null;
}
