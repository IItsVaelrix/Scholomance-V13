/**
 * Pure helpers for Update Ledger curation.
 * Fail closed on corrupt documents — never strip/filter invalid rows when authoring.
 */

/**
 * @param {string} title
 * @returns {string}
 */
function slugifyTitle(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * @param {string} date
 * @returns {boolean}
 */
function isValidCalendarDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * @param {{ title: string, summary: string, date: string }} input
 * @returns {{ ok: true, entry: { id: string, date: string, title: string, summary: string } } | { ok: false, error: string }}
 */
export function createLedgerEntry({ title, summary, date }) {
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const trimmedSummary = typeof summary === 'string' ? summary.trim() : '';
  const trimmedDate = typeof date === 'string' ? date.trim() : '';

  if (trimmedTitle.length < 3 || trimmedTitle.length > 100) {
    return { ok: false, error: 'title must be 3–100 characters after trim' };
  }
  if (trimmedSummary.length < 20 || trimmedSummary.length > 500) {
    return { ok: false, error: 'summary must be 20–500 characters after trim' };
  }
  if (!isValidCalendarDate(trimmedDate)) {
    return { ok: false, error: 'date must be a valid YYYY-MM-DD calendar date' };
  }

  const slug = slugifyTitle(trimmedTitle);
  if (!slug) {
    return { ok: false, error: 'title must yield a non-empty slug' };
  }

  return {
    ok: true,
    entry: {
      id: `${trimmedDate}-${slug}`,
      date: trimmedDate,
      title: trimmedTitle,
      summary: trimmedSummary,
    },
  };
}

/**
 * @param {{ existingEntries: unknown[], entry: { id: string } }} input
 * @returns {{ ok: true, entries: unknown[] } | { ok: false, error: string }}
 */
export function prependLedgerEntry({ existingEntries, entry }) {
  if (!Array.isArray(existingEntries)) {
    return { ok: false, error: 'existingEntries must be an array' };
  }
  if (!entry || typeof entry.id !== 'string') {
    return { ok: false, error: 'entry must include an id' };
  }
  const duplicate = existingEntries.some(
    (row) => row && typeof row === 'object' && row.id === entry.id,
  );
  if (duplicate) {
    return { ok: false, error: `duplicate id: ${entry.id}` };
  }
  return { ok: true, entries: [entry, ...existingEntries] };
}

/**
 * @param {unknown[]} entries
 * @returns {string}
 */
export function serializeLedger(entries) {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

/**
 * @param {string} source
 * @returns {{ ok: true, entries: unknown[] } | { ok: false, error: string }}
 */
export function parseExistingLedger(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'ledger document must be a JSON array' };
  }
  // Return as-is — do not filter or strip invalid rows when authoring.
  return { ok: true, entries: parsed };
}
