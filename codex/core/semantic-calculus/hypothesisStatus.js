/**
 * WHY THIS MODULE IS .js AND ITS SIBLINGS ARE .ts
 *
 * Production runs `node codex/server/index.js` on Node 20 (Dockerfile CMD,
 * package.json engines) — no TS loader, and no native type stripping until
 * 22.6. A server .js importing a .ts module throws ERR_UNKNOWN_FILE_EXTENSION,
 * which is why the rest of semantic-calculus is imported only by tests.
 *
 * Hypothesis EVALUATION is the one piece that must run in production: the
 * Constellation sense probe is evaluated per request. This file had only
 * type-only imports, so it carries no runtime dependency and moves cleanly.
 * It stays the single source of truth — the alternative was duplicating
 * evalPredicate into a .js twin, and two evaluators that drift are how a
 * falsifier quietly stops meaning what it says.
 *
 * Types live in ./types.ts and are referenced by JSDoc below, erased at runtime.
 *
 * @typedef {import('./types.ts').CausalHypothesis} CausalHypothesis
 * @typedef {import('./types.ts').CausalHypothesisStatus} CausalHypothesisStatus
 * @typedef {import('./types.ts').Falsifier} Falsifier
 * @typedef {import('./types.ts').ObservationReceipt} ObservationReceipt
 * @typedef {import('./types.ts').PredicateSpec} PredicateSpec
 * @typedef {import('./types.ts').Prediction} Prediction
 *
 * The interface `export`ed by the .ts original. It carried no runtime value, so
 * the emit dropped it; restored as a typedef rather than left to disappear —
 * the move was a language change, not an API change.
 *
 * @typedef {{
 *   supported: readonly string[],
 *   surviving: readonly string[],
 *   eliminated: readonly string[],
 *   underdetermined: readonly string[],
 *   exclusive: readonly string[],
 *   byId: Readonly<Record<string, CausalHypothesisStatus>>,
 * }} HypothesisEvaluation
 */

/**
 * SEMANTIC CALCULUS — competitive causal hypothesis evaluation (rev 7)
 *
 * Formal state machine:
 *   eliminated(h)      ⇔ ∃f∈Fh : observed(f) fails  [only status=observed]
 *   supported(h)       ⇔ ∀ required predictions hold ∧ ¬eliminated
 *   surviving(h)       ⇔ ¬eliminated ∧ testing incomplete
 *   underdetermined(h) ⇔ observations refused/error/inconclusive for required bits
 *   exclusive(h)       ⇔ supported(h) ∧ ∀r≠h: eliminated(r)  [optional; default empty]
 *
 * Tool failure never eliminates. Unsearched never counts as refutation.
 * Multiple hypotheses may be supported simultaneously.
 */
/**
 * The calculus's own function-word set, deliberately NOT imported from
 * codex/core/constellation/stopwords.js. The calculus is domain-agnostic
 * infrastructure; importing a domain module to evaluate a sealed predicate would
 * let that domain silently change what a falsifier means. The runtime ops above
 * set the precedent — csp_blocks_host carries its own path names inline.
 */
const FUNCTION_WORDS = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
    'of', 'on', 'or', 'the', 'to', 'with', 'is', 'it', 'its', 'that', 'this',
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
    'can', 'could', 'must', 'not', 'no', 'nor', 'so', 'if', 'then', 'than',
    'too', 'very', 'just', 'about', 'above', 'after', 'again', 'all', 'also',
    'am', 'any', 'because', 'before', 'between', 'both', 'each', 'few',
    'he', 'her', 'here', 'him', 'his', 'how', 'i', 'me', 'more', 'most',
    'my', 'myself', 'our', 'out', 'over', 'own', 'same', 'she', 'some',
    'such', 'them', 'there', 'these', 'they', 'those', 'through', 'under',
    'until', 'up', 'we', 'what', 'when', 'where', 'which', 'while', 'who',
    'whom', 'why', 'you', 'your',
]);
/** Content words only. Lowercased, function words dropped, duplicates collapsed. */
function contentWords(text) {
    const found = String(text ?? '').toLowerCase().match(/[a-z']+/g) ?? [];
    return new Set(found.filter((w) => w.length > 1 && !FUNCTION_WORDS.has(w)));
}
/**
 * The overlap the sealed predicates use, exported so a caller that needs to
 * IDENTIFY a winner uses the same computation the falsifiers judge.
 *
 * Two implementations of "overlap" would drift, and a falsifier measuring
 * something other than what the selector picked is not a falsifier — it is a
 * second opinion that happens to run afterwards.
 *
 * @param {string} gloss
 * @param {readonly string[]} queryTokens
 * @returns {number}
 */
export function glossOverlapCount(gloss, queryTokens) {
  const joined = Array.isArray(queryTokens) ? queryTokens.join(' ') : String(queryTokens ?? '');
  return overlapCount(String(gloss ?? ''), contentWords(joined));
}

function overlapCount(gloss, queryWords) {
    let n = 0;
    for (const w of contentWords(gloss))
        if (queryWords.has(w))
            n += 1;
    return n;
}
/**
 * Overlap scores for every candidate, descending, or `null` when the harness did
 * not supply enough to judge. `null` becomes 'inconclusive' at the call site:
 * a gloss the harness declined to report has not refuted anything.
 */
function overlapScores(result, candidatesPath, queryTokensPath, glossField) {
    const candidates = getPath(result, candidatesPath);
    const tokens = getPath(result, queryTokensPath);
    if (!Array.isArray(candidates) || candidates.length === 0)
        return null;
    if (!Array.isArray(tokens))
        return null;
    const queryWords = contentWords(tokens.join(' '));
    const scores = [];
    for (const c of candidates) {
        const gloss = c == null ? undefined : c[glossField];
        // A candidate without gloss text is an unanswered question, not a zero.
        if (typeof gloss !== 'string')
            return null;
        scores.push(overlapCount(gloss, queryWords));
    }
    return scores.sort((a, b) => b - a);
}
/**
 * Shared guard for the `every_*` ops. An empty array must NEVER satisfy a
 * universal claim: "every kin names its edge" over zero kin is vacuously true
 * and would protect the hypothesis on evidence nobody collected — the same
 * direction of lie evalPredicate's header documents.
 */
function elementsOf(result, path) {
    const arr = getPath(result, path);
    if (!Array.isArray(arr) || arr.length === 0)
        return null;
    return arr;
}
function getPath(result, path) {
    if (!path)
        return result;
    let cur = result;
    for (const part of path.split('.')) {
        if (cur == null || typeof cur !== 'object')
            return undefined;
        cur = cur[part];
    }
    return cur;
}
export function evalPredicate(predicate, result) {
    /**
     * A path the harness never reported is UNSEARCHED, not false.
     *
     * Found by using this: a falsifier asked for `phaserCanvasCount` and the
     * harness returned `canvasCount`. `eq` on the absent path returned false, the
     * falsifier read as "did not fire", and the hypothesis survived — on evidence
     * nobody had collected. That is the same error the numeric ops already guard
     * ("unsearched counts as refutation", mirrored): here absence silently
     * PROTECTED a claim instead of eliminating one. Both directions are lies.
     *
     * `falsy` is deliberately included: a missing field is not a false field. The
     * harness declining to answer must never satisfy a predicate about the answer.
     */
    const missing = (path) => getPath(result, path) === undefined;
    switch (predicate.op) {
        case 'eq':
            if (missing(predicate.path))
                return 'inconclusive';
            return getPath(result, predicate.path) === predicate.value;
        case 'neq':
            if (missing(predicate.path))
                return 'inconclusive';
            return getPath(result, predicate.path) !== predicate.value;
        case 'in':
            if (missing(predicate.path))
                return 'inconclusive';
            return predicate.values.includes(getPath(result, predicate.path));
        case 'truthy':
            if (missing(predicate.path))
                return 'inconclusive';
            return Boolean(getPath(result, predicate.path));
        case 'falsy':
            if (missing(predicate.path))
                return 'inconclusive';
            return !getPath(result, predicate.path);
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte': {
            const v = getPath(result, predicate.path);
            // A missing or non-numeric field has not refuted anything. Coercing it to
            // 0 would silently eliminate a hypothesis on absent evidence, which is the
            // "unsearched counts as refutation" error one layer down.
            if (typeof v !== 'number' || Number.isNaN(v))
                return 'inconclusive';
            if (predicate.op === 'lt')
                return v < predicate.value;
            if (predicate.op === 'lte')
                return v <= predicate.value;
            if (predicate.op === 'gt')
                return v > predicate.value;
            return v >= predicate.value;
        }
        case 'http_status_in': {
            const status = getPath(result, 'status') ?? getPath(result, 'httpStatus');
            return typeof status === 'number' && predicate.values.includes(status);
        }
        case 'csp_blocks_host': {
            const imgSrc = String(getPath(result, 'imgSrc') ?? getPath(result, 'csp') ?? '');
            if (!imgSrc)
                return 'inconclusive';
            const host = predicate.host;
            // Blocks if host is not in allowlist (and not *).
            if (imgSrc.includes('*') && !imgSrc.includes("'self'"))
                return false;
            return !imgSrc.includes(host);
        }
        case 'csp_allows_host': {
            const imgSrc = String(getPath(result, 'imgSrc') ?? getPath(result, 'csp') ?? '');
            if (!imgSrc)
                return 'inconclusive';
            return imgSrc.includes(predicate.host) || imgSrc.includes('*');
        }
        case 'gloss_overlap_lt': {
            const scores = overlapScores(result, predicate.candidatesPath, predicate.queryTokensPath, predicate.glossField ?? 'gloss');
            if (scores === null)
                return 'inconclusive';
            return scores[0] < predicate.n;
        }
        case 'gloss_overlap_margin_lt': {
            const scores = overlapScores(result, predicate.candidatesPath, predicate.queryTokensPath, predicate.glossField ?? 'gloss');
            if (scores === null)
                return 'inconclusive';
            // One candidate means nothing was compared. Treating the margin as the
            // lone score would report a disambiguation that never happened.
            if (scores.length < 2)
                return 'inconclusive';
            return scores[0] - scores[1] < predicate.n;
        }
        case 'every_field_in': {
            const els = elementsOf(result, predicate.path);
            if (els === null)
                return 'inconclusive';
            for (const el of els) {
                const v = el == null ? undefined : el[predicate.field];
                if (v === undefined)
                    return 'inconclusive';
                if (!predicate.values.includes(v))
                    return false;
            }
            return true;
        }
        case 'every_field_truthy': {
            const els = elementsOf(result, predicate.path);
            if (els === null)
                return 'inconclusive';
            for (const el of els) {
                const v = el == null ? undefined : el[predicate.field];
                if (v === undefined)
                    return 'inconclusive';
                if (!v)
                    return false;
            }
            return true;
        }
        default:
            return 'inconclusive';
    }
}
function receiptFor(receipts, observationId) {
    return receipts.find((r) => r.observationId === observationId);
}
function predictionHolds(p, receipts) {
    const rec = receiptFor(receipts, p.observationId);
    if (!rec)
        return 'missing';
    if (rec.status !== 'observed')
        return 'bad';
    // A prediction WITHOUT a predicate can only assert "the observation
    // succeeded". That is honest but nearly vacuous, and it is how a prediction
    // reading "a bounded cache exists" reported as support. Formulas should carry
    // a predicate; this branch stays for the ones whose evidence really is the
    // observation's mere success.
    if (!p.predicate)
        return true;
    const v = evalPredicate(p.predicate, rec.result);
    return v;
}
function falsifierTriggered(f, receipts) {
    const rec = receiptFor(receipts, f.observationId);
    if (!rec)
        return 'missing';
    if (rec.status === 'refused' || rec.status === 'error')
        return 'bad';
    if (rec.status === 'inconclusive')
        return 'inconclusive';
    if (rec.status !== 'observed')
        return 'bad';
    const v = evalPredicate(f.predicate, rec.result);
    if (v === 'inconclusive')
        return 'inconclusive';
    // Falsifier "triggers" (eliminates) when its predicate is TRUE
    // e.g. csp_allows_host true eliminates "CSP blocks" hypothesis via f_csp_allows
    // Wait - in our schema falsifiers eliminate when observed. For h_csp_blocks_cdn2,
    // f_csp_allows_cdn2 eliminates it when allows is true. So trigger = predicate true.
    return v === true;
}
/**
 * Evaluate hypotheses against submitted receipts only.
 * Does not re-run harnesses.
 */
export function evaluateHypotheses(hypotheses, receipts, opts = {}) {
    const byId = {};
    const supported = [];
    const surviving = [];
    const eliminated = [];
    const underdetermined = [];
    for (const h of hypotheses) {
        let elim = false;
        let undetermined = false;
        let incomplete = false;
        let allPredOk = true;
        for (const f of h.falsifiers) {
            const t = falsifierTriggered(f, receipts);
            if (t === true)
                elim = true;
            if (t === 'bad' || t === 'inconclusive')
                undetermined = true;
            if (t === 'missing')
                incomplete = true;
        }
        for (const p of h.predictions) {
            if (!p.required)
                continue;
            const ph = predictionHolds(p, receipts);
            if (ph === 'missing') {
                incomplete = true;
                allPredOk = false;
            }
            else if (ph === 'bad') {
                undetermined = true;
                allPredOk = false;
            }
            else if (ph !== true) {
                allPredOk = false;
            }
        }
        if (elim) {
            byId[h.id] = 'eliminated';
            eliminated.push(h.id);
        }
        else if (undetermined) {
            // A falsifier we could not EVALUATE (harness refused, errored, or never
            // reported the path it asks about) means we cannot say the claim survived
            // its own test. Previously this required `&& !allPredOk`, so an
            // untestable falsifier next to a holding prediction reported SUPPORTED —
            // support resting on the one check nobody managed to run.
            byId[h.id] = 'underdetermined';
            underdetermined.push(h.id);
        }
        else if (allPredOk && !incomplete) {
            byId[h.id] = 'supported';
            supported.push(h.id);
        }
        else {
            byId[h.id] = 'surviving';
            surviving.push(h.id);
        }
    }
    const exclusive = [];
    if (opts.allowExclusive && supported.length === 1) {
        const only = supported[0];
        const othersElim = hypotheses.every((h) => h.id === only || byId[h.id] === 'eliminated');
        if (othersElim && surviving.length === 0 && underdetermined.length === 0) {
            byId[only] = 'exclusive';
            exclusive.push(only);
        }
    }
    return Object.freeze({
        supported: Object.freeze(supported),
        surviving: Object.freeze(surviving),
        eliminated: Object.freeze(eliminated),
        underdetermined: Object.freeze(underdetermined),
        exclusive: Object.freeze(exclusive),
        byId: Object.freeze(byId),
    });
}
