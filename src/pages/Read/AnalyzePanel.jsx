import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { buildAnalysisContextInput } from './analysisContext.js';
import { useLexicalAnalyze } from './useLexicalAnalyze.js';
import './AnalyzePanel.css';

const SCOPES = [
  ['word', 'Word'],
  ['selection', 'Selection'],
  ['line', 'Line'],
  ['local', 'Local'],
  ['document', 'Document'],
];

const GROUP_ORDER = ['meaning', 'related', 'oppositions', 'sound', 'phrases', 'literary', 'symbols', 'corpus'];

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

const POS_BUCKETS = [
  ['noun', 'Nouns'],
  ['verb', 'Verbs'],
  ['adjective', 'Adjectives'],
  ['adverb', 'Adverbs'],
  ['unclassified', 'Unclassified'],
];

function bucketByPos(items) {
  const byBucket = new Map(POS_BUCKETS.map(([key]) => [key, []]));
  for (const entry of items) {
    const poses = (Array.isArray(entry.pos) ? entry.pos : []).filter((pos) => byBucket.has(pos));
    if (poses.length === 0) byBucket.get('unclassified').push(entry);
    else for (const pos of poses) byBucket.get(pos).push(entry);
  }
  return POS_BUCKETS
    .map(([key, label]) => ({
      key,
      label,
      items: [...byBucket.get(key)].sort((a, b) => (
        String(a.text).localeCompare(String(b.text), 'en', { sensitivity: 'base' })
      )),
    }))
    .filter((bucket) => bucket.items.length > 0);
}

function ItemList({ groupKey, bucketKey, items, onAction }) {
  return (
    <ul className="az-list">
      {items.map((item, index) => (
        <li key={`${groupKey}-${bucketKey}-${item.text}-${index}`} className={`az-item${item.derived ? ' az-item--derived' : ''}`}>
          <span className="az-item__text">{item.text}</span>
          <span className="az-item__meta">
            <span className="az-chip" title={item.note || ''}>{item.source || 'source'}</span>
            {item.derived && <span className="az-chip az-chip--loose">derived</span>}
          </span>
          <span className="az-actions" aria-label={`Craft actions for ${item.text}`}>
            <button type="button" onClick={() => onAction('insert', item)} title="Insert at cursor" aria-label={`Insert ${item.text}`}>⤵</button>
            <button type="button" onClick={() => onAction('replace', item)} title="Replace selection" aria-label={`Replace with ${item.text}`}>⇄</button>
            <button type="button" onClick={() => onAction('pin', item)} title="Pin" aria-label={`Pin ${item.text}`}>📌</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

ItemList.propTypes = {
  groupKey: PropTypes.string.isRequired,
  bucketKey: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  onAction: PropTypes.func.isRequired,
};

function ResultGroup({ group, onAction }) {
  const items = Array.isArray(group?.items) ? group.items : [];
  const bucketed = items.some((entry) => Array.isArray(entry.pos));
  return (
    <section className="az-group">
      <h3 className="az-group__title">
        {group?.label || group?.key} <span className="az-group__count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="az-empty">{group?.emptyReason || 'No results in this channel.'}</p>
      ) : bucketed ? (
        bucketByPos(items).map((bucket) => (
          <div key={`${group.key}-${bucket.key}`} className="az-bucket">
            <h4 className="az-bucket__title">
              {bucket.label} <span className="az-group__count">{bucket.items.length}</span>
            </h4>
            <ItemList groupKey={group.key} bucketKey={bucket.key} items={bucket.items} onAction={onAction} />
          </div>
        ))
      ) : (
        <ItemList groupKey={group.key} bucketKey="all" items={items} onAction={onAction} />
      )}
    </section>
  );
}

ResultGroup.propTypes = {
  group: PropTypes.shape({
    key: PropTypes.string,
    label: PropTypes.string,
    emptyReason: PropTypes.string,
    items: PropTypes.arrayOf(PropTypes.object),
  }).isRequired,
  onAction: PropTypes.func.isRequired,
};

export default function AnalyzePanel({
  initialQuery = '',
  onCraftAction,
  selection = '',
  currentLineText = '',
  scrollLines = [],
  currentLineIndex = 0,
  documentContext = '',
}) {
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState(() => (
    selection.trim() ? 'selection' : currentLineText.trim() ? 'line' : 'word'
  ));
  const [contextError, setContextError] = useState(null);
  const [activeCandidateId, setActiveCandidateId] = useState(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [pins, setPins] = useState([]);
  const reducedMotion = usePrefersReducedMotion();
  const { result, loading, error, submit, clear } = useLexicalAnalyze();

  const neighborCount = useMemo(() => {
    if (!Array.isArray(scrollLines) || !Number.isInteger(currentLineIndex)) return 0;
    return [
      ...scrollLines.slice(Math.max(0, currentLineIndex - 2), currentLineIndex),
      ...scrollLines.slice(currentLineIndex + 1, currentLineIndex + 3),
    ].filter((line) => typeof line === 'string' && line.trim()).length;
  }, [currentLineIndex, scrollLines]);

  useEffect(() => {
    if (selection.trim()) setScope('selection');
    else setScope((current) => (current === 'selection' ? 'line' : current));
  }, [selection]);

  useEffect(() => {
    const firstId = result?.resolution?.candidates?.[0]?.id || null;
    setEvidenceOpen(false);
    setActiveCandidateId((current) => (
      result?.resolution?.candidates?.some((candidate) => candidate.id === current)
        ? current
        : firstId
    ));
  }, [result]);

  const candidate = result?.resolution?.candidates?.find((entry) => entry.id === activeCandidateId)
    || result?.resolution?.candidates?.[0]
    || null;
  const candidateResult = result?.candidateResults?.find((entry) => entry.candidateId === candidate?.id);
  const candidateGroups = candidateResult?.groups || [];
  const sharedGroups = result?.sharedGroups || [];
  const visibleGroups = GROUP_ORDER
    .map((key) => [...candidateGroups, ...sharedGroups].find((group) => group.key === key))
    .filter(Boolean);
  const evidence = (candidate?.evidence || []).filter((entry) => (
    result?.context?.scope !== 'word' || (entry.channel !== 'semantics' && entry.channel !== 'pos')
  ));
  const indexPartial = result?.resolution?.morphologyIndex?.status !== 'complete';

  const scopeUnavailable = {
    word: false,
    selection: !selection.trim(),
    line: !currentLineText.trim(),
    local: !currentLineText.trim() || neighborCount === 0,
    document: !documentContext.trim(),
  };

  const onSubmit = (event) => {
    event.preventDefault();
    try {
      const context = buildAnalysisContextInput({
        scope,
        surface: query,
        selection,
        lines: scrollLines,
        lineIndex: currentLineIndex,
        documentContext,
      });
      setContextError(null);
      submit(context);
    } catch (cause) {
      setContextError(cause?.message || 'The selected context is unavailable.');
    }
  };

  const handleAction = (action, item) => {
    if (action === 'pin') {
      setPins((current) => (current.some((pin) => pin.text === item.text) ? current : [...current, item]));
      return;
    }
    onCraftAction?.({ action, item });
  };

  const handleClear = () => {
    setQuery('');
    setContextError(null);
    clear();
  };

  return (
    <div className="az-panel" data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <form className="az-query" onSubmit={onSubmit}>
        <div className="az-search">
          <input
            className="az-search__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Leximancy: a word or surface form…"
            aria-label="Leximancy query"
          />
          <button className="az-search__go" type="submit" disabled={loading || !query.trim() || scopeUnavailable[scope]}>
            {loading ? 'Analyzing…' : 'Search'}
          </button>
          {result && <button type="button" className="az-search__clear" onClick={handleClear} aria-label="Clear leximancy">×</button>}
        </div>

        <fieldset className="az-scopes">
          <legend>Evidence scope</legend>
          <div className="az-scope-grid">
            {SCOPES.map(([value, label]) => (
              <label key={value} htmlFor={`az-scope-${value}`} className={`az-scope${scope === value ? ' az-scope--active' : ''}`}>
                <input
                  id={`az-scope-${value}`}
                  type="radio"
                  name="analysis-scope"
                  value={value}
                  aria-label={label}
                  checked={scope === value}
                  disabled={scopeUnavailable[value]}
                  onChange={() => setScope(value)}
                />
                <span>{label}</span>
                {value === 'local' && <small aria-hidden="true">{neighborCount}</small>}
              </label>
            ))}
          </div>
        </fieldset>

        {scope !== 'word' && (
          <p className="az-scope-note">
            {scope === 'selection' && `Selected evidence: ${selection.trim() || 'none'}`}
            {scope === 'line' && 'Only the containing line can affect ranking.'}
            {scope === 'local' && `${neighborCount} neighboring line${neighborCount === 1 ? '' : 's'} plus the containing line can affect ranking.`}
            {scope === 'document' && 'Whole document context is explicit: every line in this document can affect ranking.'}
          </p>
        )}
      </form>

      {(contextError || error) && <div className="az-error" role="alert">{contextError || error}</div>}
      {loading && <div className="az-loading" role="status">Ranking the closed morphology lattice…</div>}

      {pins.length > 0 && (
        <div className="az-pins" aria-label="Pinned Leximancy results">
          {pins.map((pin) => (
            <span key={pin.text} className="az-pin">
              {pin.text}
              <button type="button" onClick={() => onCraftAction?.({ action: 'insert', item: pin })} aria-label={`Insert pinned ${pin.text}`}>⤵</button>
              <button type="button" onClick={() => setPins((current) => current.filter((item) => item.text !== pin.text))} aria-label={`Unpin ${pin.text}`}>×</button>
            </span>
          ))}
        </div>
      )}

      {result && (
        <div className="az-result-shell">
          <div className={`az-resolution az-resolution--${result.resolution.status}`} role="status" aria-live="polite">
            <strong>{result.resolution.status === 'clear' ? 'Clear lead' : result.resolution.status === 'unbound' ? 'Unbound' : 'Ambiguous'}</strong>
            <span>
              {result.resolution.candidates.length === 0
                ? 'No indexed lemma candidate was found.'
                : `${result.resolution.candidates.length} candidate${result.resolution.candidates.length === 1 ? '' : 's'} · margin ${Math.round(result.resolution.margin * 100)}% / ${Math.round(result.resolution.threshold * 100)}% required`}
            </span>
          </div>

          {indexPartial && (
            <div className="az-degradation" role="alert">
              Morphology coverage is {result.resolution.morphologyIndex?.status || 'unavailable'}; a lone candidate remains ambiguous.
            </div>
          )}
          {result.degradation?.length > 0 && (
            <ul className="az-degradation-list" aria-label="Analysis degradation">
              {result.degradation.map((entry) => <li key={`${entry.code}-${entry.channel}`}>{entry.reason}</li>)}
            </ul>
          )}

          {result.resolution.candidates.length > 0 && (
            <div className="az-candidates" role="tablist" aria-label="Lemma candidates">
              {result.resolution.candidates.map((entry) => {
                const selected = entry.id === candidate?.id;
                const tabId = `az-candidate-tab-${safeId(entry.id)}`;
                const panelId = `az-candidate-panel-${safeId(entry.id)}`;
                const candidateIndex = result.resolution.candidates.findIndex((item) => item.id === entry.id);
                return (
                  <button
                    key={entry.id}
                    id={tabId}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    className={`az-candidate${selected ? ' az-candidate--active' : ''}`}
                    onClick={() => setActiveCandidateId(entry.id)}
                    onKeyDown={(event) => {
                      const lastIndex = result.resolution.candidates.length - 1;
                      let nextIndex = candidateIndex;
                      if (event.key === 'ArrowRight') nextIndex = candidateIndex === lastIndex ? 0 : candidateIndex + 1;
                      else if (event.key === 'ArrowLeft') nextIndex = candidateIndex === 0 ? lastIndex : candidateIndex - 1;
                      else if (event.key === 'Home') nextIndex = 0;
                      else if (event.key === 'End') nextIndex = lastIndex;
                      else return;
                      event.preventDefault();
                      const next = result.resolution.candidates[nextIndex];
                      setActiveCandidateId(next.id);
                      requestAnimationFrame(() => document.getElementById(`az-candidate-tab-${safeId(next.id)}`)?.focus());
                    }}
                  >
                    <span className="az-candidate__rank">#{entry.rank}</span>
                    <strong>{entry.lemma}</strong>
                    <span>{entry.pos}</span>
                    <b>{Math.round(entry.score * 100)}%</b>
                  </button>
                );
              })}
            </div>
          )}

          {candidate && (
            <div
              id={`az-candidate-panel-${safeId(candidate.id)}`}
              role="tabpanel"
              aria-labelledby={`az-candidate-tab-${safeId(candidate.id)}`}
              className="az-candidate-detail"
            >
              <div className={`az-evidence${evidenceOpen ? ' az-evidence--open' : ''}`}>
                <button
                  type="button"
                  className="az-evidence__toggle"
                  aria-expanded={evidenceOpen}
                  aria-controls="az-ranking-evidence"
                  onClick={() => setEvidenceOpen((open) => !open)}
                >
                  Ranking evidence
                </button>
                <div id="az-ranking-evidence" hidden={!evidenceOpen}>
                  <p className="az-context-seal">Context seal: {result.context.contextHash}</p>
                  <ul>
                    {evidence.map((entry, index) => (
                      <li key={`${entry.channel}-${index}`} className={entry.available ? '' : 'az-evidence--unavailable'}>
                        <strong>{entry.channel}</strong>
                        <span>{entry.available ? `${Math.round(entry.score * 100)}%` : 'unavailable'}</span>
                        <span>{entry.reason}</span>
                        <small>{entry.source}{entry.contextSegments?.length ? ` · ${entry.contextSegments.join(', ')}` : ''}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="az-groups" data-testid="analyze-results">
            {visibleGroups.map((group) => <ResultGroup key={group.key} group={group} onAction={handleAction} />)}
          </div>
        </div>
      )}
    </div>
  );
}

AnalyzePanel.propTypes = {
  initialQuery: PropTypes.string,
  onCraftAction: PropTypes.func,
  selection: PropTypes.string,
  currentLineText: PropTypes.string,
  scrollLines: PropTypes.arrayOf(PropTypes.string),
  currentLineIndex: PropTypes.number,
  documentContext: PropTypes.string,
};
