import { describe, it, expect } from 'vitest';
import { fillerRule } from '../../src/lib/career/amplify/rules/filler';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return fillerRule({ document, lines: getAccomplishmentLines(document) });
}

describe('filler rule', () => {
  it('removes a hedge word and the space after it', () => {
    const raw = 'Successfully launched the mobile app.';
    const [sug] = run(raw);

    expect(sug.type).toBe('tighten');
    expect(sug.before).toBe('Successfully ');
    expect(sug.after).toBe('');
    expect(raw.slice(sug.target!.span!.start, sug.target!.span!.end)).toBe(sug.before);
    expect(sug.evidence[0].rule).toBe('filler_successfully');
  });

  it('shortens "in order to" to "to"', () => {
    const [sug] = run('Refactored the parser in order to cut build time.');
    expect(sug.before).toBe('in order to');
    expect(sug.after).toBe('to');
  });

  it('removes vague quantity phrases', () => {
    expect(run('Managed a variety of client accounts.')[0].before).toBe('a variety of ');
    expect(run('Shipped several internal tools.')[0].before).toBe('several ');
  });

  it('emits one suggestion per match, ordered by position', () => {
    const suggestions = run('Successfully shipped various tools in order to help teams.');
    expect(suggestions.map((s) => s.before)).toEqual([
      'Successfully ',
      'various ',
      'in order to',
    ]);
    const starts = suggestions.map((s) => s.target!.span!.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('produces non-overlapping spans', () => {
    const suggestions = run('Successfully shipped various tools in order to help teams.');
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].target!.span!.start).toBeGreaterThanOrEqual(
        suggestions[i - 1].target!.span!.end
      );
    }
  });

  it('stays silent on a clean line', () => {
    expect(run('Reduced build time by 40%.')).toEqual([]);
  });

  it('is deterministic', () => {
    const raw = 'Successfully shipped various tools in order to help teams.';
    expect(run(raw)).toEqual(run(raw));
  });

  it('matches and spans correctly across multiple lines', () => {
    const raw = 'Successfully launched the product.\nManaged several teams and successfully improved delivery.\nVarious tools were integrated.';
    const suggestions = run(raw);

    // Should find 4 matches:
    // 1. "Successfully " on line 1
    // 2. "several " on line 2
    // 3. "successfully " on line 2
    // 4. "Various " on line 3
    expect(suggestions.length).toBe(4);

    // Verify each suggestion's before value
    expect(suggestions[0].before).toBe('Successfully ');
    expect(suggestions[1].before).toBe('several ');
    expect(suggestions[2].before).toBe('successfully ');
    expect(suggestions[3].before).toBe('Various ');

    // Verify spans are in document order
    const starts = suggestions.map((s) => s.target!.span!.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);

    // Verify round-trip: sliced text matches the 'before' value
    for (const sug of suggestions) {
      const sliced = raw.slice(sug.target!.span!.start, sug.target!.span!.end);
      expect(sliced).toBe(sug.before);
    }

    // Verify no overlaps
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].target!.span!.start).toBeGreaterThanOrEqual(
        suggestions[i - 1].target!.span!.end
      );
    }
  });
});
