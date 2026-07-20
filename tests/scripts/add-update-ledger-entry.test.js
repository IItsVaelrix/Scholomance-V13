import { describe, expect, it } from 'vitest';
import {
  createLedgerEntry,
  prependLedgerEntry,
  serializeLedger,
  parseExistingLedger,
} from '../../scripts/lib/update-ledger-entry.js';

describe('update-ledger-entry helpers', () => {
  it('creates a dated slug id', () => {
    const result = createLedgerEntry({
      title: 'CODEx Metrics meet Song Stats',
      summary: 'The Read page Metrics panel now draws from the Song Stats engine for one chronicle.',
      date: '2026-07-19',
    });
    expect(result.ok).toBe(true);
    expect(result.entry.id).toBe('2026-07-19-codex-metrics-meet-song-stats');
  });

  it('rejects short title / short summary / bad date', () => {
    expect(createLedgerEntry({ title: 'ab', summary: 'long enough summary text here!!', date: '2026-07-19' }).ok).toBe(false);
    expect(createLedgerEntry({ title: 'Valid Title', summary: 'too short', date: '2026-07-19' }).ok).toBe(false);
    expect(createLedgerEntry({ title: 'Valid Title', summary: 'long enough summary text here!!', date: '2026-13-40' }).ok).toBe(false);
  });

  it('prepends and rejects duplicate ids', () => {
    const a = createLedgerEntry({
      title: 'First Entry Title',
      summary: 'A summary that is definitely long enough for rules.',
      date: '2026-07-19',
    }).entry;
    const b = createLedgerEntry({
      title: 'Second Entry Title',
      summary: 'Another summary that is definitely long enough here.',
      date: '2026-07-18',
    }).entry;
    const once = prependLedgerEntry({ existingEntries: [a], entry: b });
    expect(once.ok).toBe(true);
    expect(once.entries[0].id).toBe(b.id);
    const dup = prependLedgerEntry({ existingEntries: once.entries, entry: b });
    expect(dup.ok).toBe(false);
  });

  it('parseExistingLedger fails closed on corrupt JSON', () => {
    expect(parseExistingLedger('{').ok).toBe(false);
    expect(parseExistingLedger('{"no":"array"}').ok).toBe(false);
  });

  it('serializeLedger ends with one newline', () => {
    const text = serializeLedger([]);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});
