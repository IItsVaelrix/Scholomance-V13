import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { useWordLookup } from '../../hooks/useWordLookup.jsx';
import { useOracleQuery } from '../../hooks/useOracleQuery.jsx';
import { usePredictor } from '../../hooks/usePredictor.jsx';
import ErrorBoundary from '../../components/shared/ErrorBoundary.jsx';
import OracleSignalFallback from '../../components/shared/OracleSignalFallback.jsx';
import { ScholomanceDictionaryAPI } from '../../lib/scholomanceDictionary.api.js';
import { ScholomanceCorpusAPI } from '../../lib/scholomanceCorpus.api.js';
import { getCachedWord, setCachedWord } from '../../lib/platform/wordCache.js';
import OracleSubmitAnimation from './OracleSubmitAnimation.jsx';
import { getOracleSchoolTheme } from './OracleSchoolTheme.jsx';
import OracleTerminalChrome from './OracleTerminalChrome.jsx';
import { ComposeOracleTerminal } from '../../core/compose/migrated/ComposeOracleTerminal';
import { registerOracleTerminalMigration } from '../../core/compose/migrated/OracleTerminal';

registerOracleTerminalMigration();
import {
  AstrologyTrace,
  CapabilityTruth,
  ChannelConstellation,
  DefinitionArchive,
  FrequencySpectrum,
  ResonanceMap,
  SemanticKinConstellation,
} from './OracleVisualizations.jsx';
import './IDE.css';

const BOOT_LINES = [
  'INIT archive lattice...',
  'TRACE phoneme registry...',
  'RESOLVE resonance channels...',
];

const CORPUS_BOOT_LINES = [
  'QUERY corpus index...',
  'SCAN literary archive...',
  'SURFACE matched fragments...',
];

const EMPTY_CHANNELS = Object.freeze({
  definitions: [],
  synonyms: [],
  antonyms: [],
  rhymes: [],
  slantRhymes: [],
});

function normalizeLookupWord(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function formatLookupSource(source) {
  if (!source) return 'standby';
  return String(source).replace(/[^a-z0-9+_-]+/gi, ' ').trim().toLowerCase() || 'standby';
}

// Echo-family groups always render when an entry is present, even if empty
const ECHO_GROUP_IDS = new Set(['rhymes', 'slantRhymes']);

function buildChannelGroups(entry, scrollContext) {
  const data = entry || EMPTY_CHANNELS;
  const hasEntry = Boolean(entry);
  return [
    // Definitions are prose text rendered non-interactively in section 02 (Archive Stack).
    // They are intentionally excluded here so they don't appear as clickable tokens.
    {
      id: 'synonyms',
      label: 'Semantic Kin',
      words: uniqueStrings(data.synonyms),
      tone: 'synonym',
      empty: false,
    },
    {
      id: 'antonyms',
      label: 'Dissonant Kin',
      words: uniqueStrings(data.antonyms),
      tone: 'antonym',
      empty: false,
    },
    {
      id: 'rhymes',
      label: 'Echo Field',
      words: uniqueStrings(data.rhymes),
      tone: 'rhyme',
      empty: hasEntry && uniqueStrings(data.rhymes).length === 0,
    },
    {
      id: 'slantRhymes',
      label: 'Shadow Echo',
      words: uniqueStrings(data.slantRhymes),
      tone: 'slant',
      empty: hasEntry && uniqueStrings(data.slantRhymes).length === 0,
    },
    {
      id: 'assonance',
      label: 'Assonance Field',
      words: uniqueStrings(scrollContext?.assonanceLinks?.map((link) => link.word)),
      tone: 'assonance',
      empty: false,
    },
  ].filter((group) => group.words.length > 0 || (ECHO_GROUP_IDS.has(group.id) && group.empty));
}

/**
 * Renders a corpus snippet with match_offsets as clickable oracle-token glyphs.
 * Clicking a highlighted token fires a WORD mode lookup for that term.
 */
function renderSnippet(snippet, matchOffsets, onTokenClick) {
  if (!snippet) return null;
  if (!matchOffsets?.length) {
    return <span className="oracle-corpus-snippet-text">{snippet}</span>;
  }

  const segments = [];
  let lastEnd = 0;

  for (const [start, end] of matchOffsets) {
    if (start > lastEnd) {
      segments.push(
        <span key={`plain-${lastEnd}`}>{snippet.slice(lastEnd, start)}</span>
      );
    }
    const token = snippet.slice(start, end);
    if (token.trim()) {
      segments.push(
        <button
          key={`match-${start}`}
          type="button"
          className="oracle-token oracle-token--match"
          onClick={() => onTokenClick(token.trim())}
          aria-label={`Look up ${token.trim()}`}
        >
          {token}
        </button>
      );
    }
    lastEnd = end;
  }

  if (lastEnd < snippet.length) {
    segments.push(
      <span key={`plain-tail`}>{snippet.slice(lastEnd)}</span>
    );
  }

  return <span className="oracle-corpus-snippet-text">{segments}</span>;
}

let _searchPanelIdCounter = 0;

function SearchPanelInner({
  seedWord = '',
  selectedSchool = 'DEFAULT',
  contextLookup = null,
  onJumpToLine = null,
  variant = 'sidebar',
  theme = 'dark',
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const inputIdRef = useRef(`oracle-query-${_searchPanelIdCounter++}`);
  const userOverrideRef = useRef(false);
  const seedRef = useRef('');
  const castTimeoutRef = useRef(null);

  // - WORD mode state  - 
  const [query, setQuery] = useState('');
  const [resolvedWord, setResolvedWord] = useState('');
  const [lookupOverride, setLookupOverride] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [castSignal, setCastSignal] = useState(null);

  // - Mode state  - 
  const [mode, setMode] = useState('WORD'); // 'WORD' | 'CORPUS' | 'QUERY'

  // - CORPUS mode state  - 
  const [corpusResults, setCorpusResults] = useState([]);
  const [isCorpusLoading, setIsCorpusLoading] = useState(false);
  const [corpusError, setCorpusError] = useState(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState(null);

  // - Semantic kin state (WORD mode, section 07)  - 
  const [semanticKin, setSemanticKin] = useState([]);

  const {
    lookup,
    retry,
    data,
    isLoading,
    status,
    error,
    reset,
    source,
  } = useWordLookup();

  const {
    query: executeQuery,
    data: queryData,
    isLoading: isQueryLoading,
    status: queryStatus,
    error: queryError,
    reset: resetQuery,
  } = useOracleQuery();

  const { checkSpelling, getSpellingSuggestions } = usePredictor();
  const [searchMisspelling, setSearchMisspelling] = useState(null);

  const normalizedQuery = useMemo(() => normalizeLookupWord(query), [query]);

  useEffect(() => {
    if (mode !== 'WORD' || normalizedQuery.length < 2) {
      setSearchMisspelling(null);
      return;
    }

    let isCancelled = false;
    checkSpelling(normalizedQuery).then(async (isValid) => {
      if (!isCancelled && !isValid) {
        const suggestions = await getSpellingSuggestions(normalizedQuery, null, 1);
        if (!isCancelled && suggestions.length > 0) {
          setSearchMisspelling(suggestions[0]);
        }
      } else if (!isCancelled) {
        setSearchMisspelling(null);
      }
    });

    return () => { isCancelled = true; };
  }, [normalizedQuery, mode, checkSpelling, getSpellingSuggestions]);
  const schoolTheme = useMemo(() => getOracleSchoolTheme(selectedSchool), [selectedSchool]);
  const activeEntry = lookupOverride ?? data;
  const resolvedLookupWord = useMemo(
    () => normalizeLookupWord(activeEntry?.word || resolvedWord || normalizedQuery),
    [activeEntry?.word, normalizedQuery, resolvedWord]
  );
  const scrollContext = useMemo(
    () => (typeof contextLookup === 'function' ? contextLookup(resolvedLookupWord) : null),
    [contextLookup, resolvedLookupWord]
  );
  const channelGroups = useMemo(
    () => buildChannelGroups(activeEntry, scrollContext),
    [activeEntry, scrollContext]
  );
  const definitionRows = useMemo(
    () => uniqueStrings(activeEntry?.definitions?.length ? activeEntry.definitions : (activeEntry?.definition?.text ? [activeEntry.definition.text] : [])),
    [activeEntry]
  );

  // - Corpus facets derived from live results  - 
  const corpusFacets = useMemo(() => {
    const types = [...new Set(corpusResults.map((r) => r.type).filter(Boolean))];
    return { types };
  }, [corpusResults]);

  // - Filtered corpus results  - 
  const filteredCorpusResults = useMemo(() => {
    if (!activeTypeFilter) return corpusResults;
    return corpusResults.filter((r) => r.type === activeTypeFilter);
  }, [corpusResults, activeTypeFilter]);

  // - Word lookup  - 
  const performLookup = useCallback(async (nextWord, options = {}) => {
    const normalized = normalizeLookupWord(nextWord);
    if (!normalized) return;

    if (options.markUser !== false) {
      userOverrideRef.current = true;
    }

    setQuery(normalized);
    setResolvedWord(normalized);
    setLookupOverride(null);
    reset();

    const cached = getCachedWord(normalized);
    if (cached) {
      setLookupOverride(cached);
      return;
    }

    await lookup(normalized);
  }, [lookup, reset]);

  const triggerSubmitCast = useCallback((nextWord) => {
    const normalized = normalizeLookupWord(nextWord);
    if (!normalized) return;

    if (castTimeoutRef.current) {
      window.clearTimeout(castTimeoutRef.current);
    }

    setCastSignal((previous) => ({
      id: (previous?.id || 0) + 1,
      word: normalized,
    }));

    castTimeoutRef.current = window.setTimeout(() => {
      setCastSignal(null);
      castTimeoutRef.current = null;
    }, prefersReducedMotion ? 320 : 1450);
  }, [prefersReducedMotion]);

  useEffect(() => () => {
    if (castTimeoutRef.current) {
      window.clearTimeout(castTimeoutRef.current);
    }
  }, []);

  // - Cache resolved word data  - 
  useEffect(() => {
    if (!data || !resolvedWord) return;
    const normalizedDataWord = normalizeLookupWord(data.word || resolvedWord);
    if (!normalizedDataWord) return;
    setCachedWord(normalizedDataWord, data);
  }, [data, resolvedWord]);

  // - Seed word → auto lookup  - 
  useEffect(() => {
    const normalizedSeed = normalizeLookupWord(seedWord);
    if (!normalizedSeed || normalizedSeed === seedRef.current) return;
    seedRef.current = normalizedSeed;

    void performLookup(normalizedSeed, { markUser: false });
  }, [performLookup, seedWord]);

  // - WORD mode: suggestion debounce  - 
  useEffect(() => {
    if (mode !== 'WORD') return undefined;
    if (normalizedQuery.length < 2) {
      setSuggestions([]);
      setIsSuggesting(false);
      return undefined;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const nextSuggestions = await ScholomanceDictionaryAPI.suggest(normalizedQuery, { limit: 8 });
        if (!isCancelled) {
          setSuggestions(uniqueStrings(nextSuggestions).filter((word) => normalizeLookupWord(word) !== normalizedQuery));
        }
      } catch (_error) {
        if (!isCancelled) setSuggestions([]);
      } finally {
        if (!isCancelled) setIsSuggesting(false);
      }
    }, 180);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [normalizedQuery, mode]);

  // - CORPUS mode: search debounce  - 
  useEffect(() => {
    if (mode !== 'CORPUS') return undefined;
    if (normalizedQuery.length < 2) {
      setCorpusResults([]);
      setCorpusError(null);
      return undefined;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(async () => {
      setIsCorpusLoading(true);
      setCorpusError(null);
      try {
        const results = await ScholomanceCorpusAPI.search(normalizedQuery, 20);
        if (!isCancelled) {
          setCorpusResults(results);
          setActiveTypeFilter(null);
        }
      } catch (_err) {
        if (!isCancelled) {
          setCorpusError('Archive signal lost. The corpus is unreachable.');
          setCorpusResults([]);
        }
      } finally {
        if (!isCancelled) setIsCorpusLoading(false);
      }
    }, 180);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [normalizedQuery, mode]);

  // - WORD mode: semantic kin fetch after word resolves  - 
  useEffect(() => {
    if (mode !== 'WORD') return undefined;
    const word = activeEntry?.word || resolvedWord;
    if (!word) {
      setSemanticKin([]);
      return undefined;
    }

    let isCancelled = false;
    ScholomanceCorpusAPI.semantic(word, 8).then((results) => {
      if (!isCancelled) setSemanticKin(results);
    }).catch(() => {
      if (!isCancelled) setSemanticKin([]);
    });

    return () => { isCancelled = true; };
  }, [activeEntry?.word, resolvedWord, mode]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (mode === 'WORD') {
      const normalized = normalizeLookupWord(query);
      if (!normalized) return;
      triggerSubmitCast(normalized);
      void performLookup(normalized);
    } else if (mode === 'QUERY') {
      const trimmed = query.trim();
      if (!trimmed) return;
      void executeQuery(trimmed, { verseIR: null, tokenWeights: null }); // TODO: Pass actual telemetry if available
    }
  }, [performLookup, query, mode, triggerSubmitCast, executeQuery]);

  const handleClear = useCallback(() => {
    userOverrideRef.current = false;
    setQuery('');
    setResolvedWord('');
    setLookupOverride(null);
    setSuggestions([]);
    setCorpusResults([]);
    setCorpusError(null);
    setActiveTypeFilter(null);
    setSemanticKin([]);
    setCastSignal(null);
    if (castTimeoutRef.current) {
      window.clearTimeout(castTimeoutRef.current);
      castTimeoutRef.current = null;
    }
    reset();
    resetQuery();
  }, [reset, resetQuery]);

  const handleSuggestionSelect = useCallback((word) => {
    void performLookup(word);
  }, [performLookup]);

  // Jump to WORD mode and look up a token from a corpus result
  const handleCorpusTokenLookup = useCallback((token) => {
    setMode('WORD');
    void performLookup(token);
  }, [performLookup]);

  const handleSwitchMode = useCallback((nextMode) => {
    setMode(nextMode);
    setCorpusResults([]);
    setCorpusError(null);
    setActiveTypeFilter(null);
    setSuggestions([]);
    setSemanticKin([]);
    setCastSignal(null);
    if (castTimeoutRef.current) {
      window.clearTimeout(castTimeoutRef.current);
      castTimeoutRef.current = null;
    }
    reset();
    resetQuery();
  }, [reset, resetQuery]);

  const statusTone = error
    ? 'error'
    : isLoading
      ? 'loading'
      : (activeEntry || scrollContext)
        ? 'resolved'
        : 'idle';

  const headerWord = activeEntry?.word || resolvedLookupWord || 'awaiting query';
  const partOfSpeech = uniqueStrings(activeEntry?.pos).slice(0, 3).join(' / ') || 'lexeme';
  const sourceLabel = formatLookupSource(source || (lookupOverride ? 'cache' : null));

  const revealMotion = prefersReducedMotion
    ? { initial: false, animate: false }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
  const streamMotionProps = prefersReducedMotion
    ? {}
    : {
        initial: 'hidden',
        animate: 'visible',
        variants: {
          hidden: {},
          visible: { transition: { staggerChildren: 0.035 } },
        },
      };
  const streamLineMotionProps = prefersReducedMotion
    ? {}
    : {
        variants: {
          hidden: { opacity: 0, y: 5 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
          },
        },
      };

  const isLoadingChamber = mode === 'WORD' ? isLoading : mode === 'QUERY' ? isQueryLoading : isCorpusLoading;
  const currentStatusTone = mode === 'WORD' ? statusTone : mode === 'QUERY' ? queryStatus : (isCorpusLoading ? 'loading' : corpusError ? 'error' : corpusResults.length ? 'resolved' : 'idle');
  const oracleLinkStrength = currentStatusTone === 'loading'
    ? 0.35
    : currentStatusTone === 'error'
      ? 0.08
      : currentStatusTone === 'resolved'
        ? 0.88
        : 0.52;

  return (
    <div
      className={`search-panel search-panel--oracle search-panel--${variant}`}
      data-school={schoolTheme.id}
      data-oracle-scanline={schoolTheme.scanline}
      data-status={currentStatusTone}
      data-ide-theme={theme === 'light' ? 'light' : 'dark'}
    >
      <ComposeOracleTerminal
        instance={variant}
        instanceId={inputIdRef.current}
        className={[
          `oracle-school-${schoolTheme.id?.toLowerCase?.() || 'void'}`,
          isLoadingChamber ? 'oracle-shell-loading' : '',
        ].filter(Boolean).join(' ')}
        dataProps={{
          'data-school': schoolTheme.id || 'VOID',
          'data-loading': isLoadingChamber ? 'true' : 'false',
        }}
        terminalChrome={
          <OracleTerminalChrome
            schoolId={schoolTheme.id || 'VOID'}
            isLoading={isLoadingChamber}
            linkStrength={oracleLinkStrength}
            reducedMotion={prefersReducedMotion}
          />
        }
      >

        {/* Session line - TTY identity + mode tabs */}
        <div className="oracle-chrome" data-compose-part="session">
          <span className="oracle-session-id">
            <span className="oracle-session-prompt" aria-hidden="true">❯</span>
            {' '}ORACLE//TTY
          </span>
          <span className="oracle-chrome-label">
            <span aria-hidden="true">{schoolTheme.glyph}</span> LEXICON ORACLE
          </span>
          <div className="oracle-mode-toggle" role="group" aria-label="Oracle mode">
            <button
              type="button"
              className={`oracle-mode-btn${mode === 'WORD' ? ' oracle-mode-btn--active' : ''}`}
              onClick={() => handleSwitchMode('WORD')}
              aria-pressed={mode === 'WORD'}
            >
              <span className="oracle-mode-index" aria-hidden="true">1:</span>WORD
            </button>
            <button
              type="button"
              className={`oracle-mode-btn${mode === 'CORPUS' ? ' oracle-mode-btn--active' : ''}`}
              onClick={() => handleSwitchMode('CORPUS')}
              aria-pressed={mode === 'CORPUS'}
            >
              <span className="oracle-mode-index" aria-hidden="true">2:</span>CORPUS
            </button>
            <button
              type="button"
              className={`oracle-mode-btn${mode === 'QUERY' ? ' oracle-mode-btn--active' : ''}`}
              onClick={() => handleSwitchMode('QUERY')}
              aria-pressed={mode === 'QUERY'}
            >
              <span className="oracle-mode-index" aria-hidden="true">3:</span>QUERY
            </button>
          </div>
        </div>

        {/* Query form */}
        <form className="oracle-query-form" data-compose-part="prompt" onSubmit={handleSubmit}>
          <label className="oracle-query-prefix" htmlFor={inputIdRef.current}>
            {mode === 'CORPUS' ? 'corpus://' : 'archive://'}
          </label>
          <input
            id={inputIdRef.current}
            type="search"
            value={query}
            onChange={(event) => {
              userOverrideRef.current = true;
              setQuery(event.target.value);
            }}
            className="oracle-query-input"
            placeholder={
              mode === 'CORPUS'
                ? 'search the literary archive...'
                : mode === 'QUERY'
                  ? 'ask the oracle a question about your verse...'
                  : 'summon a word, echo family, or meaning shard'
            }
            autoComplete="off"
            spellCheck="false"
            aria-label={mode === 'CORPUS' ? 'Search the corpus archive' : mode === 'QUERY' ? 'Ask the Oracle' : 'Search the lexicon oracle'}
          />
          {query && (
            <button type="button" className="oracle-query-clear" onClick={handleClear} aria-label="Clear query">
              reset
            </button>
          )}
          {mode === 'WORD' && (
            <button type="submit" className="oracle-query-submit" aria-label="Resolve word in the Lexicon Oracle">
              resolve
            </button>
          )}
          {mode === 'QUERY' && (
            <button type="submit" className="oracle-query-submit" aria-label="Consult the Lexicon Oracle">
              consult
            </button>
          )}
        </form>

        <AnimatePresence>
          {mode === 'WORD' && searchMisspelling && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="oracle-did-you-mean"
              style={{ padding: '0 1rem 0.5rem', fontSize: '0.85rem' }}
            >
              <span style={{ color: 'var(--text-dim, #888)' }}>Did you mean? </span>
              <button
                type="button"
                className="btn-link"
                style={{ color: 'var(--ritual-error, #ff4d4d)', textDecoration: 'underline' }}
                onClick={() => performLookup(searchMisspelling)}
              >
                {searchMisspelling}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Signal strip */}
        <div className="oracle-signal-strip" data-compose-part="signal" aria-label="Oracle status">
          {mode === 'WORD' ? (
            <>
              <span className="oracle-signal-pill">{statusTone}</span>
              <span className="oracle-signal-pill">source::{sourceLabel}</span>
              <span className="oracle-signal-pill">
                scroll::{scrollContext?.foundInScroll ? `${scrollContext.totalOccurrences} bound` : 'unbound'}
              </span>
              <span className="oracle-signal-pill">
                query::{resolvedLookupWord || '--'}
              </span>
            </>
          ) : mode === 'QUERY' ? (
            <>
              <span className="oracle-signal-pill">
                {isQueryLoading ? 'divining' : queryError ? 'fault' : queryData ? 'resolved' : 'standby'}
              </span>
              <span className="oracle-signal-pill">
                tokens::{queryData?.recommendedTokens?.length || '--'}
              </span>
              <span className="oracle-signal-pill">
                query::{query ? (query.length > 20 ? query.slice(0, 20) + '...' : query) : '--'}
              </span>
            </>
          ) : (
            <>
              <span className="oracle-signal-pill">
                {isCorpusLoading ? 'scanning' : corpusError ? 'fault' : filteredCorpusResults.length ? 'resolved' : 'standby'}
              </span>
              <span className="oracle-signal-pill">
                results::{filteredCorpusResults.length || '--'}
              </span>
              <span className="oracle-signal-pill">
                query::{normalizedQuery || '--'}
              </span>
            </>
          )}
        </div>

        {/* WORD mode: suggestion row */}
        {mode === 'WORD' && (suggestions.length > 0 || isSuggesting) && (
          <div className="oracle-suggestion-row" role="group" aria-label="Suggested words">
            {isSuggesting && suggestions.length === 0 ? (
              <span className="oracle-suggestion-meta">predicting archive matches...</span>
            ) : (
              suggestions.map((word) => (
                <button
                  key={word}
                  type="button"
                  className="oracle-suggestion-chip"
                  onClick={() => handleSuggestionSelect(word)}
                  aria-label={`Resolve suggested word ${word}`}
                >
                  {word}
                </button>
              ))
            )}
          </div>
        )}

        {/* CORPUS mode: facet filter strip */}
        {mode === 'CORPUS' && corpusFacets.types.length > 1 && (
          <div className="oracle-facet-strip" role="group" aria-label="Filter by type">
            <button
              type="button"
              className={`oracle-facet-pill${!activeTypeFilter ? ' oracle-facet-pill--active' : ''}`}
              onClick={() => setActiveTypeFilter(null)}
              aria-pressed={!activeTypeFilter}
              aria-label="Show all corpus result types"
            >
              all
            </button>
            {corpusFacets.types.map((type) => (
              <button
                key={type}
                type="button"
                className={`oracle-facet-pill${activeTypeFilter === type ? ' oracle-facet-pill--active' : ''}`}
                onClick={() => setActiveTypeFilter(activeTypeFilter === type ? null : type)}
                aria-pressed={activeTypeFilter === type}
                aria-label={`Filter corpus results by ${type}`}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        {/* Main feed */}
        <div className="oracle-feed" data-compose-part="feed" role="region" aria-live="polite" aria-label={`Lexicon terminal output - ${inputIdRef.current}`}>
          <AnimatePresence mode="wait">

            {/* ═══ QUERY MODE ═══ */}
            {mode === 'QUERY' ? (
              isQueryLoading ? (
                <motion.div
                  key="query-loading"
                  className="oracle-boot"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  {BOOT_LINES.map((line, index) => (
                    <motion.div
                      key={`query-boot-${index}`}
                      className="oracle-boot-line"
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      animate={prefersReducedMotion ? false : { opacity: 1, x: 0 }}
                      transition={prefersReducedMotion ? undefined : { delay: index * 0.09, duration: 0.22 }}
                    >
                      <span className="oracle-boot-prompt">&gt;&gt;</span>
                      <span>{line.replace('INIT', 'DIVINING')}</span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : queryError ? (
                <motion.div
                  key="query-error"
                  className="oracle-stack"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <OracleSignalFallback status="disconnected" error={queryError} />
                </motion.div>
              ) : queryData ? (
                <motion.div
                  key="query-results"
                  className="oracle-stack"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <motion.section className="oracle-section" {...streamMotionProps}>
                    <div className="oracle-section-head">
                      <span className="oracle-section-index">01</span>
                      <span className="oracle-section-label">Divination</span>
                    </div>
                    <motion.div className="oracle-corpus-snippet-text" {...streamLineMotionProps} style={{ padding: '0.5rem 1rem' }}>
                      {queryData.responseText}
                    </motion.div>
                  </motion.section>
                  
                  {queryData.recommendedTokens && queryData.recommendedTokens.length > 0 && (
                    <motion.section className="oracle-section" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">02</span>
                        <span className="oracle-section-label">Recommended Forms</span>
                      </div>
                      <motion.div className="oracle-suggestion-row" style={{ padding: '0.5rem 1rem' }} {...streamLineMotionProps}>
                        {queryData.recommendedTokens.map(token => (
                          <button
                            key={token}
                            type="button"
                            className="oracle-suggestion-chip"
                            onClick={() => handleCorpusTokenLookup(token)}
                          >
                            {token}
                          </button>
                        ))}
                      </motion.div>
                    </motion.section>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="query-idle"
                  className="oracle-idle"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <p className="oracle-idle-title">Ask the Oracle.</p>
                  <p className="oracle-idle-copy">
                    The Oracle perceives the rhythm and tone of your verse. Ask it for guidance, stylistic advice, or structural adjustments. Max 200 words.
                  </p>
                  <div className="oracle-idle-prompt">
                    <span>&gt;&gt;</span>
                    <span>try: My verse feels too heavy. How can I lighten the final line?</span>
                  </div>
                </motion.div>
              )
            ) : mode === 'CORPUS' ? (
              isCorpusLoading ? (
                <motion.div
                  key="corpus-loading"
                  className="oracle-boot"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  {CORPUS_BOOT_LINES.map((line, index) => (
                    <motion.div
                      key={line}
                      className="oracle-boot-line"
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      animate={prefersReducedMotion ? false : { opacity: 1, x: 0 }}
                      transition={prefersReducedMotion ? undefined : { delay: index * 0.09, duration: 0.22 }}
                    >
                      <span className="oracle-boot-prompt">&gt;&gt;</span>
                      <span>{line}</span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : corpusError ? (
                <motion.div
                  key="corpus-error"
                  className="oracle-stack"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <motion.section className="oracle-section oracle-section--error" {...streamMotionProps}>
                    <div className="oracle-section-head">
                      <span className="oracle-section-index">XX</span>
                      <span className="oracle-section-label">Archive Fault</span>
                    </div>
                    <motion.div className="oracle-error-line" {...streamLineMotionProps}>
                      {corpusError}
                    </motion.div>
                  </motion.section>
                </motion.div>
              ) : filteredCorpusResults.length > 0 ? (
                <motion.div
                  key={`corpus-results-${normalizedQuery}`}
                  className="oracle-stack"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <motion.section className="oracle-section" {...streamMotionProps}>
                    <div className="oracle-section-head">
                      <span className="oracle-section-index">01</span>
                      <span className="oracle-section-label">Archive Fragments</span>
                    </div>
                    <div className="oracle-corpus-results">
                      {filteredCorpusResults.map((result, index) => (
                        <motion.div
                          key={`${result.id}-${index}`}
                          className="oracle-corpus-card"
                          {...streamLineMotionProps}
                        >
                          <div className="oracle-corpus-meta">
                            {result.title && (
                              <span className="oracle-corpus-meta-title">{result.title}</span>
                            )}
                            {result.author && (
                              <span className="oracle-corpus-meta-author">{result.author}</span>
                            )}
                            {result.type && (
                              <span className="oracle-corpus-meta-type">{result.type}</span>
                            )}
                            {result.match_score != null && (
                              <span className="oracle-corpus-meta-score">
                                {Math.round(result.match_score * 100) / 100}
                              </span>
                            )}
                          </div>
                          <div className="oracle-corpus-snippet">
                            {renderSnippet(
                              result.snippet || result.text,
                              result.match_offsets,
                              handleCorpusTokenLookup
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.section>
                </motion.div>
              ) : normalizedQuery.length >= 2 ? (
                <motion.div
                  key="corpus-empty"
                  className="oracle-idle"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <p className="oracle-idle-title">No fragments surfaced.</p>
                  <p className="oracle-idle-copy">
                    The archive holds no record matching this query. Try fewer words or a root form.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="corpus-idle"
                  className="oracle-idle"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <p className="oracle-idle-title">Archive standing by.</p>
                  <p className="oracle-idle-copy">
                    Query the literary corpus. Matched fragments surface with their phonemic tokens highlighted - click any token to resolve it in WORD mode.
                  </p>
                  <div className="oracle-idle-prompt">
                    <span>&gt;&gt;</span>
                    <span>try: shadow, covenant, iron, dissolution</span>
                  </div>
                </motion.div>
              )
            ) : (

            /* ═══ WORD MODE ═══ */
              isLoading ? (
                <motion.div
                  key="oracle-loading"
                  className="oracle-boot"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  {BOOT_LINES.map((line, index) => (
                    <motion.div
                      key={line}
                      className="oracle-boot-line"
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      animate={prefersReducedMotion ? false : { opacity: 1, x: 0 }}
                      transition={prefersReducedMotion ? undefined : { delay: index * 0.09, duration: 0.22 }}
                    >
                      <span className="oracle-boot-prompt">&gt;&gt;</span>
                      <span>{line}</span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (activeEntry || scrollContext || error || normalizedQuery) ? (
                <motion.div
                  key={`oracle-${headerWord}`}
                  className="oracle-stack"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  {/* 01 - Capability Truth */}
                  <motion.section className="oracle-section oracle-section--summary" {...streamMotionProps}>
                    <div className="oracle-section-head">
                      <span className="oracle-section-index">01</span>
                      <span className="oracle-section-label">Capability Truth</span>
                    </div>
                    <CapabilityTruth
                      word={headerWord}
                      partOfSpeech={partOfSpeech}
                      pronunciation={activeEntry?.pronunciation || ''}
                      echoKey={scrollContext?.core?.rhymeKey || ''}
                      schoolTheme={schoolTheme}
                    />
                  </motion.section>

                  {/* 02 - Archive Stack */}
                  {definitionRows.length > 0 && (
                    <motion.section className="oracle-section" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">02</span>
                        <span className="oracle-section-label">Archive Stack</span>
                      </div>
                      <DefinitionArchive
                        definitions={definitionRows}
                        etymology={activeEntry?.etymology}
                        itemMotionProps={streamLineMotionProps}
                      />
                    </motion.section>
                  )}

                  {/* 03 - Measured Reality */}
                  {scrollContext && (scrollContext.foundInScroll || (scrollContext.resonanceLinks?.length || 0) > 0 || (scrollContext.assonanceLinks?.length || 0) > 0) && (
                    <motion.section className="oracle-section" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">03</span>
                        <span className="oracle-section-label">Measured Reality</span>
                      </div>
                      <ResonanceMap
                        scrollContext={scrollContext}
                        onJumpToLine={onJumpToLine}
                        itemMotionProps={streamLineMotionProps}
                      />
                    </motion.section>
                  )}

                  {/* 04 - Signal Channels */}
                  {channelGroups.length > 0 && (
                    <motion.section className="oracle-section" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">04</span>
                        <span className="oracle-section-label">Signal Channels</span>
                      </div>
                      <ChannelConstellation
                        groups={channelGroups}
                        onTokenSelect={handleSuggestionSelect}
                        itemMotionProps={streamLineMotionProps}
                      />
                    </motion.section>
                  )}

                  {/* 05 - Astrology Trace */}
                  {scrollContext?.astrology && (
                    <motion.section className="oracle-section" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">05</span>
                        <span className="oracle-section-label">Astrology Trace</span>
                      </div>
                      <AstrologyTrace
                        astrology={scrollContext.astrology}
                        onTokenSelect={handleSuggestionSelect}
                        itemMotionProps={streamLineMotionProps}
                      />
                    </motion.section>
                  )}

                  {/* 06 - Live Resonance */}
                  {scrollContext?.resonanceLinks?.length > 0 && (
                    <motion.section className="oracle-section" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">06</span>
                        <span className="oracle-section-label">Live Resonance</span>
                      </div>
                      <FrequencySpectrum
                        links={scrollContext.resonanceLinks}
                        onJumpToLine={onJumpToLine}
                        itemMotionProps={streamLineMotionProps}
                      />
                    </motion.section>
                  )}

                  {/* 07 - Phonemic Kin (semantic endpoint) */}
                  {semanticKin.length > 0 && (
                    <motion.section className="oracle-section" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">07</span>
                        <span className="oracle-section-label">Phonemic Kin</span>
                      </div>
                      <SemanticKinConstellation
                        semanticKin={semanticKin}
                        onTokenSelect={handleSuggestionSelect}
                        itemMotionProps={streamLineMotionProps}
                      />
                    </motion.section>
                  )}

                  {/* XX - Signal Fault */}
                  {error && !activeEntry && (
                    <motion.section className="oracle-section oracle-section--error" {...streamMotionProps}>
                      <div className="oracle-section-head">
                        <span className="oracle-section-index">XX</span>
                        <span className="oracle-section-label">Signal Fault</span>
                      </div>
                      {(status === 'disconnected' || status === 'initializing' || status === 'timeout') ? (
                        <OracleSignalFallback
                          status={status}
                          error={error}
                          onReconnect={retry}
                          isReconnecting={isLoading}
                        />
                      ) : (
                        <motion.div className="oracle-error-line" {...streamLineMotionProps}>
                          {error.message}
                        </motion.div>
                      )}
                    </motion.section>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="oracle-idle"
                  className="oracle-idle"
                  {...revealMotion}
                  transition={{ duration: 0.24 }}
                >
                  <p className="oracle-idle-title">Lexicon oracle standing by.</p>
                  <p className="oracle-idle-copy">
                    Query a word to stream definitions, rhyme families, slant echoes, and live scroll resonance into the chamber.
                  </p>
                  <div className="oracle-idle-prompt">
                    <span>&gt;&gt;</span>
                    <span>try: dusk, fracture, vow, ember</span>
                  </div>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>

        <OracleSubmitAnimation
          active={Boolean(castSignal)}
          animationKey={castSignal?.id || 0}
          word={castSignal?.word || resolvedLookupWord || normalizedQuery}
          selectedSchool={schoolTheme.id}
          prefersReducedMotion={prefersReducedMotion}
        />
      </ComposeOracleTerminal>
    </div>
  );
}

/**
 * Pillar 4 (S-Gate): the divination panel is wrapped in an ErrorBoundary so a
 * render-time crash degrades to an in-world "Oracle signal fading" surface
 * instead of unmounting the IDE frame. Applies to every SearchPanel call site.
 */
export default function SearchPanel(props) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="search-panel search-panel--oracle search-panel--boundary">
          <OracleSignalFallback status="crashed" error={error} onReconnect={reset} />
        </div>
      )}
    >
      <SearchPanelInner {...props} />
    </ErrorBoundary>
  );
}
