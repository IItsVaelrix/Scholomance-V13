/**
 * Extract the completed word immediately before the in-progress prefix.
 * Used so editor spellcheck can feed bigram context into Spellchecker.
 *
 * @param {string|null|undefined} textBeforeCursor
 * @param {string|null|undefined} currentPrefix
 * @returns {string|null}
 */
export function extractPreviousWord(textBeforeCursor, currentPrefix = '') {
  const text = String(textBeforeCursor || '');
  const prefix = String(currentPrefix || '');
  if (!text) return null;

  let beforeCurrent = text;
  if (prefix) {
    const lowerText = text.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();
    if (lowerText.endsWith(lowerPrefix)) {
      beforeCurrent = text.slice(0, text.length - prefix.length);
    }
  }

  const match = beforeCurrent.match(/([a-zA-Z']+)[^a-zA-Z']*$/);
  return match ? match[1] : null;
}
