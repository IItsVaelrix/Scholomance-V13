import { useCallback, useEffect, useState } from 'react';
import { SEARCH_PLACEHOLDERS } from './placeholders.js';

const PLACEHOLDER_INTERVAL_MS = 4000;
const EMPTY_REFUSAL = 'Enter a word, phrase, or line to search the literary sky.';

/** Leading sigil — a small constellation, echoing the sky. Decorative. */
function SearchSigil() {
  return (
    <svg className="constellation-search__sigil" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="5" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="19" y2="8" />
      <line x1="12" y1="12" x2="14" y2="19" />
      <circle cx="5" cy="7" r="1.5" />
      <circle cx="19" cy="8" r="1.2" />
      <circle cx="14" cy="19" r="1.2" />
      <circle cx="12" cy="12" r="2" className="constellation-search__sigil-core" />
    </svg>
  );
}

export default function ConstellationSearch({
  mode,
  onSubmit,
  onEmptySubmit,
  defaultValue = '',
  reducedMotion = false,
}) {
  const [value, setValue] = useState(defaultValue);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [refusal, setRefusal] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const placeholder =
    reducedMotion || mode !== 'idle'
      ? SEARCH_PLACEHOLDERS[0]
      : SEARCH_PLACEHOLDERS[placeholderIndex];

  useEffect(() => {
    if (reducedMotion || mode !== 'idle') {
      return undefined;
    }

    const id = setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % SEARCH_PLACEHOLDERS.length);
    }, PLACEHOLDER_INTERVAL_MS);

    return () => clearInterval(id);
  }, [reducedMotion, mode]);

  const attemptSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setRefusal(EMPTY_REFUSAL);
      onEmptySubmit?.();
      return;
    }

    setRefusal('');
    onSubmit(trimmed);
  }, [value, onSubmit, onEmptySubmit]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      attemptSubmit();
    }
  };

  return (
    <div
      id="constellation-search"
      className={[
        'constellation-search',
        `constellation-search--${mode}`,
        focused ? 'constellation-search--focused' : '',
        !reducedMotion ? 'constellation-search--breathe' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label htmlFor="constellation-search-field" className="constellation-search__label">
        Search the literary sky
      </label>
      <div className="constellation-search__field-wrap">
        <span className="constellation-search__ring" aria-hidden="true" />
        <SearchSigil />
        <textarea
          id="constellation-search-field"
          className="constellation-search__field"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          rows={1}
        />
        <button
          type="button"
          className="constellation-search__submit"
          aria-label="Search"
          onClick={attemptSubmit}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="constellation-search__submit-glyph">
            <path d="M13 5l1.6 5.4L20 12l-5.4 1.6L13 19l-1.6-5.4L6 12l5.4-1.6z" />
          </svg>
        </button>
      </div>
      {refusal ? (
        <div role="status" className="constellation-search__refusal">
          {refusal}
        </div>
      ) : null}
    </div>
  );
}
