const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLedgerEntry(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.id === 'string' &&
      value.id.trim() &&
      typeof value.date === 'string' &&
      ISO_DATE_PATTERN.test(value.date) &&
      typeof value.title === 'string' &&
      value.title.trim() &&
      typeof value.summary === 'string' &&
      value.summary.trim()
  );
}

export function parseLedgerEntries(source, limit = 30) {
  try {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isValidLedgerEntry)
      .slice(0, limit);
  } catch {
    return [];
  }
}
