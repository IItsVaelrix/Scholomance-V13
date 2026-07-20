import { describe, expect, it } from 'vitest';
import { isValidLedgerEntry, parseLedgerEntries } from '../../../src/pages/Landing/updateLedgerModel.js';

describe('updateLedgerModel', () => {
  it('accepts a well-formed entry', () => {
    expect(isValidLedgerEntry({
      id: '2026-07-19-example',
      date: '2026-07-19',
      title: 'Example',
      summary: 'A short summary that explains the change.',
    })).toBe(true);
  });

  it('rejects bad dates and empty fields', () => {
    expect(isValidLedgerEntry({ id: 'x', date: '07-19-2026', title: 'T', summary: 'S' })).toBe(false);
    expect(isValidLedgerEntry({ id: '', date: '2026-07-19', title: 'T', summary: 'S' })).toBe(false);
  });

  it('parses malformed JSON to empty array', () => {
    expect(parseLedgerEntries('{')).toEqual([]);
  });

  it('filters invalid rows, preserves order, caps at 30', () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({
      id: `2026-07-19-item-${i}`,
      date: '2026-07-19',
      title: `Title ${i}`,
      summary: `Summary for item ${i}`,
    }));
    rows.splice(1, 0, { id: 'bad', date: 'nope', title: 'x', summary: 'y' });
    const source = JSON.stringify(rows);
    const parsed = parseLedgerEntries(source, 30);
    expect(parsed).toHaveLength(30);
    expect(parsed[0].id).toBe('2026-07-19-item-0');
    expect(parsed.every((e) => e.id !== 'bad')).toBe(true);
  });

  it('returns empty for non-array JSON', () => {
    expect(parseLedgerEntries('{"id":"x"}')).toEqual([]);
  });
});
