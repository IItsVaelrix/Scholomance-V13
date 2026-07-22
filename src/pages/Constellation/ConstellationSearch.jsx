import { useCallback, useEffect, useState } from 'react';
import { SEARCH_PLACEHOLDERS } from './placeholders.js';

const PLACEHOLDER_INTERVAL_MS = 4000;
const EMPTY_REFUSAL = 'Enter a word, phrase, or line to search the literary sky.';

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
    <div id="constellation-search" className={`constellation-search constellation-search--${mode}`}>
      <label htmlFor="constellation-search-field" className="constellation-search__label">
        Search the literary sky
      </label>
      <textarea
        id="constellation-search-field"
        className="constellation-search__field"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
      />
      <button
        type="button"
        className="constellation-search__submit"
        aria-label="Search"
        onClick={attemptSubmit}
      >
        Search
      </button>
      {refusal ? (
        <div role="status" className="constellation-search__refusal">
          {refusal}
        </div>
      ) : null}
    </div>
  );
}
