/**
 * A GOLD TREEBANK READER.
 *
 * Coverage — "did some molecule of type S span the input" — cannot say whether
 * a parse is right. A sentence that spans with the wrong subject scores as a
 * success, so 36.6% coverage is consistent with any accuracy including zero.
 * This module supplies the other half: a human annotation the parser can
 * disagree with.
 *
 * The gold is Universal Dependencies English-EWT (CC BY-SA 4.0). A dependency
 * treebank fits without conversion because `projectAnswer` returns
 * `{subject, verb}` = `headOf(parts[0])`, `headOf(parts[1])`, which in
 * dependency terms is exactly `nsubj` + `root`.
 */

/**
 * Which UPOS values name a lexical category `compose` can type an atom with.
 * Everything else — DET, ADP, PRON, AUX, CCONJ, SCONJ, PART, NUM, PUNCT, INTJ,
 * SYM, X — is absent on purpose: `atomsFor` types those from its closed-class
 * sets keyed on the literal word, and a POS entry for them would say nothing.
 */
const UPOS_TO_TAG = new Map([
  ['NOUN', 'n'], ['PROPN', 'n'], ['VERB', 'v'], ['ADJ', 'a'], ['ADV', 'r'],
]);

/**
 * Read CoNLL-U text into sentence records.
 *
 * @param {string} text
 * @returns {Array<{sentId: string|null, text: string|null, tokens: Array<{id: number, form: string, lemma: string, upos: string, head: number, deprel: string}>}>}
 */
export function parseConllu(text) {
  const records = [];
  let sentId = null;
  let sentText = null;
  let tokens = [];

  const flush = () => {
    if (tokens.length > 0) records.push({ sentId, text: sentText, tokens });
    sentId = null;
    sentText = null;
    tokens = [];
  };

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '') { flush(); continue; }
    if (line.startsWith('#')) {
      const meta = /^#\s*(sent_id|text)\s*=\s*(.*)$/.exec(line);
      if (meta && meta[1] === 'sent_id') sentId = meta[2].trim();
      if (meta && meta[1] === 'text') sentText = meta[2].trim();
      continue;
    }
    const fields = line.split('\t');
    if (fields.length < 8) continue;
    const id = fields[0];
    /**
     * A RANGE LINE (`2-3  don't`) is a surface form covering two tokens, and an
     * EMPTY NODE (`4.1`) is an elided element with no surface form. Counting
     * either as a token misaligns every index downstream of here.
     */
    if (id.includes('-') || id.includes('.')) continue;
    tokens.push({
      id: Number(id),
      form: fields[1],
      lemma: fields[2],
      upos: fields[3],
      head: Number(fields[6]),
      deprel: fields[7],
    });
  }
  flush();
  return records;
}

/**
 * The gold answer for the anchor query, in the shape `projectAnswer` returns.
 *
 * The subject is read from the `nsubj` edge rather than from position, because
 * English inverts: `From the AP comes this story` has its subject after the
 * verb. `root` may be non-verbal — web text roots on nouns (`Great food !`) —
 * and that is carried as-is rather than dropped, because a missing verb is a
 * fact about the sentence, not about the reader.
 *
 * @param {object} record
 * @returns {{subject: string|null, verb: string|null}}
 */
export function goldAnswer(record) {
  const tokens = (record && record.tokens) || [];
  const root = tokens.find((t) => t.head === 0);
  if (!root) return { subject: null, verb: null };
  const subject = tokens.find(
    (t) => t.head === root.id && (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass'),
  );
  return { subject: subject ? subject.form : null, verb: root.form };
}

/**
 * An ORACLE POS table for one sentence, in the shape `compose` consumes.
 *
 * A form whose UPOS is not lexical maps to an EMPTY array rather than being
 * absent, which records that gold saw the word and assigned it no lexical
 * reading. Note that an empty array does not suppress `guessPos` inside
 * `atomsFor` — the oracle is therefore not perfectly clean, and the runner
 * measures how dirty it is instead of assuming.
 *
 * @param {object} record
 * @returns {Map<string, string[]>}
 */
export function goldPosMap(record) {
  const map = new Map();
  for (const token of (record && record.tokens) || []) {
    const key = String(token.form).toLowerCase();
    const tag = UPOS_TO_TAG.get(token.upos);
    if (!tag) {
      if (!map.has(key)) map.set(key, []);
      continue;
    }
    const existing = map.get(key);
    if (existing && existing.length > 0) {
      if (!existing.includes(tag)) existing.push(tag);
    } else {
      map.set(key, [tag]);
    }
  }
  return map;
}

export { UPOS_TO_TAG };
