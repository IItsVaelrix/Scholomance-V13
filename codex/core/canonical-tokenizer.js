/**
 * CANONICAL TOKENIZER — one pass over the source, tokens that carry valence.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Three tokenizers grew independently: `codex/core/tokenizer.js` (`\b\w+\b`),
 * `scripts/generate_corpus.js` (`[a-z']+`), and `queryIdentity.js`
 * (`split(/\s+/)`). They disagree about apostrophes, digits and hyphens, so the
 * same sentence becomes three different token streams depending on which door
 * it came through.
 *
 * Worse, two of them DESTROY information. Measured over 40 Project Gutenberg
 * books (~1.07M tokens): `\b\w+\b` produces 9,932 contraction fragments —
 * `don't` becomes `don` + `t`, and the token `s` alone occurs 4,880 times — and
 * splits 5,493 hyphenated compounds (`peach-tree`, `new-mown`, `to-day`) into
 * unrelated words. A phrase search cannot find a unit its tokenizer refuses to
 * admit exists.
 *
 * ─── VALENCE ───────────────────────────────────────────────────────────────
 *
 * A hyphen is not noise between two words. It is the author STATING that these
 * pieces bond. `compose.js` documents that its N+N compound bond misfires at
 * roughly 48% "juxtaposition-orphan" — it is guessing which adjacent nouns form
 * a compound from bare adjacency, while the hyphen that says so outright was
 * discarded one layer earlier. Same for the genitive: `ATOM_INVENTORY` already
 * declares `POSS` and `GEN`, and the tokenizer deletes every apostrophe before
 * the grammar can see one.
 *
 * So a unit carries the bond its punctuation declared. Downstream may consume
 * it or ignore it, but it is no longer thrown away at the door.
 *
 * ─── WHAT THIS REFUSES TO DECIDE ───────────────────────────────────────────
 *
 * `'s` is genuinely ambiguous between a genitive (`the sea's edge`) and a
 * contraction of is/has (`the sea's risen`). Orthography does not settle it and
 * neither does this module: it emits AMBIGUOUS carrying both candidates, for
 * the arbiter to rule on with more context. Picking one here would be the soft
 * default this architecture exists to prevent.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/canonical-tokenizer
 */

/** What a unit's punctuation declared about how its pieces bond. */
export const VALENCE = Object.freeze({
  /** An ordinary word. Nothing was declared. */
  FREE: 'free',
  /** Hyphen: the author declared these pieces bond as a compound. */
  COMPOUND: 'compound',
  /**
   * One word broken by typesetting, not two words bonded — `ap-ple`, `hea-ven-ly`.
   * The hyphen belongs to the page, not to the language, so the repair is to
   * REJOIN rather than discard: today `ap-ple` yields the junk tokens `ap` and
   * `ple` while the real word `apple` disappears from the corpus along with its
   * frequency count.
   */
  FRACTURED: 'fractured',
  /** `boys'`, and `'s` once an arbiter has ruled it possessive. */
  GENITIVE: 'genitive',
  /** `n't`, `'ll`, `'ve`, `'re`, `'d`, `'m`, `'tis` — a bound form. */
  CLITIC: 'clitic',
  /** `'s` — genitive or is/has. Not decidable from spelling. */
  AMBIGUOUS: 'ambiguous',
  /** `--`, `—`, `–`: a SEPARATOR, the opposite of a bond. */
  DASH: 'dash',
  /** Any other punctuation, kept so the stream stays reversible. */
  MARK: 'mark',
});

/** A word-piece is exactly what `\w` matches, so the legacy view can be rebuilt. */
const PIECE_RE = /[A-Za-z0-9_]+/g;
const APOSTROPHES = new Set(["'", '’']);
const HYPHENS = new Set(['-', '‐', '‑']);
/** Two or more hyphens, or a real dash, is an em-dash: it separates, never binds. */
const DASHES = new Set(['–', '—']);

/** Auxiliary and negation clitics that attach with an apostrophe. */
const AUX_CLITICS = new Set(['ll', 've', 're', 'd', 'm']);

const isApos = (ch) => APOSTROPHES.has(ch);
const isHyphen = (ch) => HYPHENS.has(ch);

/**
 * Classify an apostrophe-bound pair.
 *
 * `n't` is detected on the STEM's final `n`, because the negation is `n't` and
 * the tokenizer's word-pieces cut it as `do|n` + `t`.
 */
function apostropheValence(stemLower, suffixLower) {
  if (suffixLower === 't' && stemLower.endsWith('n')) {
    return { valence: VALENCE.CLITIC, clitic: 'not' };
  }
  if (AUX_CLITICS.has(suffixLower)) {
    return { valence: VALENCE.CLITIC, clitic: suffixLower };
  }
  if (suffixLower === 's') {
    /**
     * THE ONE THIS MODULE WILL NOT GUESS. Both readings are live and common,
     * and only context separates them.
     */
    return { valence: VALENCE.AMBIGUOUS, candidates: [VALENCE.GENITIVE, VALENCE.CLITIC] };
  }
  return { valence: VALENCE.FREE };
}

/**
 * Hyphen at a line end: `spy-\nglass`. Rare in Project Gutenberg plain text
 * (measured 22 occurrences in 5.5M characters) because the transcription
 * already reflows, but a scanned or OCR'd source is full of them.
 */
const LINE_BREAK_BINDER = /^[-‐‑][ \t]*\r?\n\s*$/;

/**
 * Tokenize source text into canonical units.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {(word: string) => boolean} [options.isKnownWord] lexicon predicate.
 *   Required to detect FRACTURED, because deciding that `ap-ple` is one broken
 *   word and `man-of-war` is three joined ones is a LEXICAL judgement and this
 *   module may not read a dictionary. Absent it, nothing is ever reported as
 *   fractured — the repair fails closed rather than guessing, because a wrong
 *   rejoin destroys a real compound (`man-of-war` -> `manofwar`) and that is
 *   worse than leaving the break in place.
 * @returns {{ source: string, units: Array<object> }}
 */
export function tokenizeCanonical(text, options = {}) {
  const source = String(text ?? '');
  const isKnownWord = typeof options.isKnownWord === 'function' ? options.isKnownWord : null;
  const units = [];
  if (!source) return { source, units };

  // All maximal \w runs, with offsets. Everything between them is punctuation.
  const pieces = [];
  PIECE_RE.lastIndex = 0;
  let m;
  while ((m = PIECE_RE.exec(source)) !== null) {
    pieces.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }

  const pushMarks = (from, to) => {
    for (let at = from; at < to; at += 1) {
      const ch = source[at];
      if (/\s/.test(ch)) continue;
      // Collapse a run of hyphens/dashes into one DASH unit.
      if (isHyphen(ch) || DASHES.has(ch)) {
        let stop = at;
        while (stop < to && (isHyphen(source[stop]) || DASHES.has(source[stop]))) stop += 1;
        const raw = source.slice(at, stop);
        units.push({
          text: raw, lower: raw, pieces: [], valence: VALENCE.DASH, start: at, end: stop,
        });
        at = stop - 1;
        continue;
      }
      units.push({
        text: ch, lower: ch, pieces: [], valence: VALENCE.MARK, start: at, end: at + 1,
      });
    }
  };

  let cursor = 0;
  let i = 0;
  while (i < pieces.length) {
    /**
     * A leading elision (`'tis`) must be claimed BEFORE the gap is flushed, or
     * the apostrophe is emitted as a standalone mark and the unit that owns it
     * starts one character too late.
     */
    const pieceStart = pieces[i].start;
    const prevEnd = i > 0 ? pieces[i - 1].end : -1;
    const leadingApos = pieceStart > 0
      && isApos(source[pieceStart - 1])
      && prevEnd !== pieceStart - 1
      && pieceStart - 1 >= cursor;
    pushMarks(cursor, leadingApos ? pieceStart - 1 : pieceStart);

    // Grow a unit rightwards for as long as a single binder joins word-pieces.
    const group = [pieces[i]];
    const binders = [];
    let j = i;
    let lineBroken = false;
    while (j + 1 < pieces.length) {
      const gap = source.slice(pieces[j].end, pieces[j + 1].start);
      if (gap.length === 1 && (isHyphen(gap) || isApos(gap))) {
        binders.push(gap);
        group.push(pieces[j + 1]);
        j += 1;
        continue;
      }
      /**
       * A hyphen swallowed by a line end still binds. Grouping across it costs
       * the legacy views nothing — neither `\w+` nor `[a-z']+` can cross a
       * newline anyway — but it is the only way to see the break at all.
       */
      if (LINE_BREAK_BINDER.test(gap)) {
        binders.push(gap[0]);
        group.push(pieces[j + 1]);
        lineBroken = true;
        j += 1;
        continue;
      }
      break;
    }

    const start = group[0].start;
    let end = group[group.length - 1].end;
    const pieceTexts = group.map((p) => p.text);
    const lowerPieces = pieceTexts.map((p) => p.toLowerCase());

    let valence = VALENCE.FREE;
    let extra = {};
    if (binders.length > 0) {
      if (binders.every(isHyphen)) {
        valence = VALENCE.COMPOUND;
        /**
         * THE TWO-CONDITION TEST. Both must hold:
         *
         *   1. AT LEAST ONE piece is not a known word. A fully lexicalised
         *      compound (`man-of-war`, `peach-tree`, `by-and-by`) is left alone.
         *   2. The rejoined form IS a known word — `water`, `butterfly`. This
         *      is the condition doing the real protective work: `manofwar` and
         *      `byandby` are not words, so those compounds survive condition 2
         *      even when a function word inside them is missing from the
         *      lexicon.
         *
         * Condition 1 was originally "NO piece is known", and measurement
         * showed that was wrong. Syllabified primer text constantly leaves a
         * fragment that coincidentally spells a word — `fa` is a musical note,
         * `e` and `wa` are lexicon entries — so `fa-ther`, `ev-e-ry`, `en-e-my`
         * and `wa-ter` all failed the strict test and went unhealed. Across
         * 3,410 distinct Gutenberg compounds the strict form healed 38; this
         * form heals 233, and the additions are overwhelmingly correct.
         *
         * KNOWN COST: ~1.3% of heals are normalisations rather than repairs —
         * `pre-arranged` -> `prearranged` flattens a legitimate hyphenation to
         * its solid form. Both spellings are attested, so this loses an
         * authorial choice rather than a meaning.
         */
        if (isKnownWord) {
          const joined = lowerPieces.join('');
          const someUnknown = lowerPieces.some((p) => !isKnownWord(p));
          if (someUnknown && isKnownWord(joined)) valence = VALENCE.FRACTURED;
        }
      } else if (binders.length === 1 && isApos(binders[0])) {
        const v = apostropheValence(lowerPieces[0], lowerPieces[1]);
        valence = v.valence;
        extra = v;
        delete extra.valence;
      } else {
        // Mixed binders (`rock'n-roll`) declare nothing coherent; stay FREE and
        // keep the pieces so nothing is lost.
        valence = VALENCE.FREE;
      }
    }

    /**
     * A TRAILING APOSTROPHE IS A PLURAL GENITIVE — `the boys' coats`. It binds
     * leftwards to a word already ending in `s`, and has no right-hand piece,
     * so the grouping loop above cannot see it.
     */
    let trailingApos = false;
    if (
      valence === VALENCE.FREE
      && end < source.length
      && isApos(source[end])
      && lowerPieces[lowerPieces.length - 1].endsWith('s')
      && !(pieces[j + 1] && pieces[j + 1].start === end + 1)
    ) {
      trailingApos = true;
      valence = VALENCE.GENITIVE;
      end += 1;
    }

    /** A leading apostrophe is an elision — `'tis`, `'n'`, `'twas`. */
    if (leadingApos && valence === VALENCE.FREE) valence = VALENCE.CLITIC;

    units.push({
      text: source.slice(leadingApos ? start - 1 : start, end),
      lower: source.slice(leadingApos ? start - 1 : start, end).toLowerCase(),
      pieces: pieceTexts,
      valence,
      binders: binders.slice(),
      lineBroken,
      /**
       * The form a consumer should actually index. A fractured word is healed
       * (`ap-ple` -> `apple`), a compound keeps the bond its author declared
       * (`peach-tree`), everything else is itself.
       */
      canonical: (() => {
        if (valence === VALENCE.FRACTURED) return lowerPieces.join('');
        if (valence === VALENCE.COMPOUND) return lowerPieces.join('-');
        // An apostrophe-bound form keeps its apostrophe: collapsing `sea's` to
        // `seas` would collide it with the plural, which is a different word.
        if (binders.length > 0 && binders.every(isApos)) return lowerPieces.join("'");
        return lowerPieces.join('');
      })(),
      leadingApos,
      trailingApos,
      /**
       * WHICH apostrophe, not merely whether. `[a-z']+` matches the ASCII
       * apostrophe only, so a curly `’` SPLITS a word in the legacy corpus view
       * while a straight `'` joins it. Gutenberg mixes both, and a projection
       * that normalised them would silently disagree with the stream it claims
       * to reproduce.
       */
      leadingAposChar: leadingApos ? source[start - 1] : null,
      trailingAposChar: trailingApos ? source[end - 1] : null,
      start: leadingApos ? start - 1 : start,
      end,
      ...extra,
    });

    cursor = end;
    i = j + 1;
  }
  pushMarks(cursor, source.length);

  return { source, units };
}

/** Units that carry word material, in order. */
const wordUnits = (packet) => packet.units.filter((u) => u.pieces.length > 0);

/**
 * LEGACY VIEW — `codex/core/tokenizer.js`: `text.toLowerCase().match(/\b(\w+)\b/g)`.
 *
 * A word-piece is defined as a maximal `\w` run, so flattening the pieces in
 * document order reproduces that stream exactly.
 *
 * @returns {string[]}
 */
export function projectCoreTokens(packet) {
  const out = [];
  for (const u of wordUnits(packet)) for (const p of u.pieces) out.push(p.toLowerCase());
  return out;
}

/**
 * LEGACY VIEW — `scripts/generate_corpus.js`: `text.toLowerCase().match(/[a-z']+/g)`.
 *
 * That class keeps apostrophes and drops digits and underscores, so a piece is
 * re-split on anything outside `[a-z]` and rejoined across apostrophe binders.
 *
 * @returns {string[]}
 */
export function projectCorpusTokens(packet) {
  /**
   * `[a-z']+` also matches punctuation-only runs — a lone `'` used as a quote
   * mark is a "word" to that regex. Those are noise, but reproducing them is
   * the whole point of a projection: it must be provably substitutable for the
   * tokenizer it replaces, including where that tokenizer is silly. Units are
   * therefore tiled by adjacency (they cover every non-whitespace character)
   * and the class is applied across each contiguous run.
   */
  const out = [];
  const units = packet.units;
  let idx = 0;
  while (idx < units.length) {
    let end = idx;
    while (end + 1 < units.length && units[end + 1].start === units[end].end) end += 1;
    const run = units.slice(idx, end + 1);
    idx = end + 1;

    /**
     * A punctuation-only run needs no special case: the class simply keeps its
     * ASCII apostrophes and drops everything else, which is exactly what the
     * legacy regex does to a bare quote mark.
     */
    const runText = run.map((u) => u.text).join('');
    for (const t of runText.toLowerCase().match(/[a-z']+/g) || []) out.push(t);
  }
  return out;
}

/**
 * THE REPAIRED STREAM — what a corpus builder should actually count.
 *
 * Unlike the legacy views this is NOT byte-identical to anything; it is the
 * point of the exercise. A fractured word is healed back into one token, so its
 * frequency lands on `apple` instead of being lost while `ap` and `ple` accrue
 * counts they should never have had.
 *
 * @returns {string[]}
 */
export function projectRepairedTokens(packet) {
  return wordUnits(packet).map((u) => u.canonical);
}

/**
 * The units a phrase search should treat as single lexical items: anything the
 * author bound. `peach-tree` is one thing to look up, not two.
 *
 * @returns {string[]}
 */
export function projectBoundUnits(packet) {
  return wordUnits(packet)
    .filter((u) => u.valence === VALENCE.COMPOUND)
    .map((u) => u.pieces.join('-').toLowerCase());
}
