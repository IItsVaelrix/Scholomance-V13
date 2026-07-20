// Deterministic, read-only composition for IDE Analyze. Morphology nominates a
// closed candidate set; semantic ballistics may rank it but never widen it.

import { rankLemmaCandidates as defaultRankLemmaCandidates } from '../../core/lexical-analysis/lemmaRanker.js';
import { candidateId, normalizeLemmaPos } from '../../core/lexical-analysis/morphology.js';

const canonical = (value) => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('en-US');

function group(key, label, items, emptyReason) {
  const list = items.filter(Boolean);
  if (list.length === 0) {
    return { key, label, items: [], emptyReason: emptyReason || 'No results in the graph yet.' };
  }
  return { key, label, items: list };
}

function effectiveContext(context) {
  if (context.scope === 'selection') return context.selection;
  if (context.scope === 'line') return context.containingLine;
  if (context.scope === 'local') {
    return [...context.neighboringLines, context.containingLine].join('\n');
  }
  if (context.scope === 'document') return context.documentContext;
  return context.surface;
}

function posMatches(entryPos, candidatePos) {
  if (!entryPos) return true;
  try {
    return normalizeLemmaPos(entryPos) === candidatePos;
  } catch {
    return false;
  }
}

const CANONICAL_POS = Object.freeze(['noun', 'verb', 'adjective', 'adverb']);

function normalizePosSet(rawList) {
  const allowed = new Set(CANONICAL_POS);
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(rawList) ? rawList : []) {
    try {
      const normalized = normalizeLemmaPos(raw);
      if (!seen.has(normalized) && allowed.has(normalized)) {
        out.push(normalized);
        seen.add(normalized);
      }
    } catch {
      // Unmappable POS is dropped, never invented.
    }
  }
  return out;
}

export function createLexicalAnalyzeService({
  lexiconAdapter,
  lexicalGraphAdapter,
  lemmaAdapter,
  rankLemmaCandidates = defaultRankLemmaCandidates,
}) {
  function candidateEntries(candidate) {
    return lexiconAdapter.lookupWord(candidate.lemma)
      .filter((entry) => posMatches(entry?.pos, candidate.pos));
  }

  function meaning(candidate, candidateSenses) {
    const senseItems = (Array.isArray(candidateSenses) ? candidateSenses : [])
      .filter((sense) => typeof sense?.definition === 'string' && sense.definition.trim())
      .map((sense) => ({
        text: sense.definition,
        source: 'wordnet:sense',
        sourceUrl: sense.sourceUrl,
        confidence: 0.92,
        ref: { kind: 'synset', id: String(sense.synsetId) },
      }));
    if (senseItems.length > 0) return group('meaning', 'Meaning', senseItems);

    const entries = candidateEntries(candidate);
    const primary = entries[0] || null;
    const glosses = entries
      .flatMap((entry) => (Array.isArray(entry?.senses) ? entry.senses : []))
      .flatMap((sense) => (Array.isArray(sense?.glosses) ? sense.glosses : []));
    return group('meaning', 'Meaning', glosses.map((text) => ({
      text,
      source: 'entry:gloss',
      sourceUrl: primary?.sourceUrl,
      confidence: 0.9,
      ref: primary ? { kind: 'word', id: String(primary.id) } : undefined,
    })), 'No dictionary entry found for this lemma and part of speech.');
  }

  function related(candidate) {
    const synonyms = lexiconAdapter.lookupSynonyms(candidate.lemma, 12)
      .map((entry) => ({
        text: entry.lemma,
        pos: normalizePosSet(entry.pos),
        source: 'wordnet:synonym',
        confidence: 0.8,
        ref: { kind: 'word', id: entry.lemma },
      }));
    const relation = lexiconAdapter.lookupRelated(candidate.lemma, 10);
    const relatedItem = (entry, source, note, confidence) => ({
      text: entry.lemma,
      pos: normalizePosSet(entry.pos),
      source,
      confidence,
      note,
      ref: { kind: 'word', id: entry.lemma },
    });
    const broader = relation.broader.map((entry) => relatedItem(entry, 'wordnet:hypernym', 'broader', 0.7));
    const narrower = relation.narrower.map((entry) => relatedItem(entry, 'wordnet:hyponym', 'narrower', 0.7));
    const akin = relation.akin.map((entry) => relatedItem(entry, 'wordnet:similar', 'akin', 0.65));
    return group(
      'related',
      'Related language',
      [...synonyms, ...akin, ...broader, ...narrower],
      'No related words found.',
    );
  }

  function oppositions(candidate) {
    const items = lexiconAdapter.lookupAntonyms(candidate.lemma, 12).map((entry) => ({
      text: entry.lemma,
      pos: normalizePosSet(entry.pos),
      source: 'wordnet:antonym',
      confidence: 0.8,
      ref: { kind: 'word', id: entry.lemma },
    }));
    return group('oppositions', 'Oppositions', items, 'No antonym source ingested yet.');
  }

  function sound(surface) {
    const rhymes = lexiconAdapter.lookupRhymes(surface, 14);
    const perfectWords = rhymes.words || [];
    const slantWords = lexiconAdapter.lookupSlantRhymes(surface, 10) || [];
    const posByWord = typeof lexiconAdapter.batchLookupPos === 'function'
      ? lexiconAdapter.batchLookupPos([...perfectWords, ...slantWords])
      : {};
    const wordPos = (word) => normalizePosSet(posByWord[canonical(word)] ?? []);
    const perfect = perfectWords.map((word) => ({
      text: word,
      pos: wordPos(word),
      source: 'rhyme_index',
      confidence: 0.9,
      note: rhymes.family || undefined,
      ref: { kind: 'word', id: word },
    }));
    const slant = slantWords.map((word) => ({
      text: word,
      pos: wordPos(word),
      source: 'rhyme_index:slant',
      confidence: 0.6,
      derived: true,
      note: 'slant',
    }));
    return group('sound', 'Sound', [...perfect, ...slant], 'No rhymes found.');
  }

  function phrases() {
    return group('phrases', 'Phrases', [], 'Phrase ingest not yet available.');
  }

  function literary(context) {
    const anchor = effectiveContext(context);
    const page = lexicalGraphAdapter.searchFts(anchor, { types: ['device'], limit: 8 });
    let devices = page.results || [];
    let viaCatalog = false;
    if (devices.length === 0) {
      devices = (lexicalGraphAdapter.listLiteraryDevices({ limit: 6 }).results || []);
      viaCatalog = true;
    }
    const items = devices.map((device) => {
      const text = viaCatalog
        ? (device.name || device.id)
        : (device.canonicalText || device.id);
      const definitionText = viaCatalog
        ? device.definition
        : (Array.isArray(device.definitions) ? device.definitions[0]?.text : undefined);
      return {
        text,
        source: 'device',
        confidence: 0.85,
        ref: { kind: 'device', id: String(device.id) },
        // Preserves the existing Analyze retrieval fix: catalog fallback is
        // derived evidence and must say why no direct FTS match was used.
        derived: viaCatalog || undefined,
        note: viaCatalog
          ? `${definitionText ? `${String(definitionText).slice(0, 120)} — ` : ''}Catalog fallback (no FTS match).`
          : (definitionText ? String(definitionText).slice(0, 120) : undefined),
      };
    });
    return group('literary', 'Literary techniques', items, 'Device overlay not migrated.');
  }

  function symbols(candidate) {
    const rows = lexiconAdapter.lookupSymbolsLoose(candidate.lemma, 10).map((row) => ({
      text: row.lemma,
      pos: normalizePosSet(row.pos),
      source: `wordnet:${row.via}`,
      confidence: 0.4,
      derived: true,
      note: row.via === 'domain' ? 'shares a domain (loose)' : 'exemplified by (loose)',
    }));
    return group('symbols', 'Symbols', rows, 'No symbol ingest yet; loose links only.');
  }

  function corpus(candidate, candidateSenses) {
    const senseExamples = (Array.isArray(candidateSenses) ? candidateSenses : [])
      .flatMap((sense) => (Array.isArray(sense?.examples) ? sense.examples : []));
    const examples = (senseExamples.length > 0 ? senseExamples : candidateEntries(candidate)
      .flatMap((entry) => (Array.isArray(entry?.senses) ? entry.senses : []))
      .flatMap((sense) => (Array.isArray(sense?.examples) ? sense.examples : [])))
      .slice(0, 6);
    return group('corpus', 'Corpus examples', examples.map((text) => ({
      text,
      source: 'entry:example',
      confidence: 0.7,
      derived: true,
      note: 'dictionary example',
    })), 'No corpus examples found.');
  }

  function analyze(context) {
    const surface = canonical(context.surface);
    const forms = lemmaAdapter.lookupForms(surface);
    const morphologyIndex = lemmaAdapter.getIndexState();
    const ids = [...new Set(forms.map((form) => candidateId(form.lemma, form.pos)))].sort();
    const sensesByCandidate = new Map(ids.map((id) => {
      const form = forms.find((candidateForm) => candidateId(
        candidateForm.lemma,
        candidateForm.pos,
      ) === id);
      return [id, lemmaAdapter.lookupSenses(form.lemma, form.pos)];
    }));
    const lemmas = [...new Set(forms.map((form) => form.lemma))].sort();
    const frequencies = lemmaAdapter.getCorpusFrequencies(lemmas);
    const ranked = rankLemmaCandidates({
      context,
      forms,
      sensesByCandidate,
      frequencies,
      morphologyIndex,
    });

    const sharedGroups = Object.freeze([
      sound(surface),
      phrases(),
      literary(context),
    ]);
    const candidateResults = Object.freeze(ranked.resolution.candidates.map((candidate) => {
      const candidateSenses = sensesByCandidate.get(candidate.id) ?? [];
      return {
        candidateId: candidate.id,
        groups: Object.freeze([
          meaning(candidate, candidateSenses),
          related(candidate),
          oppositions(candidate),
          symbols(candidate),
          corpus(candidate, candidateSenses),
        ]),
      };
    }));

    return Object.freeze({
      context: Object.freeze({
        version: context.version,
        scope: context.scope,
        contextHash: context.contextHash,
      }),
      resolution: ranked.resolution,
      sharedGroups,
      candidateResults,
      degradation: ranked.degradation,
    });
  }

  return Object.freeze({ analyze });
}
