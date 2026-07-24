import { describe, it, expect } from 'vitest';
import {
  getAccomplishmentLines,
  leadingVerb,
  isQuantified,
  classifyObject,
  nextTokenAfter,
} from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

describe('amplify primitives', () => {
  describe('getAccomplishmentLines', () => {
    it('returns trimmed lines with exact raw spans', () => {
      const raw = 'Led the platform team.\n  Built the billing API.\n';
      const lines = getAccomplishmentLines(makeResumeDoc(raw));

      expect(lines.map((l) => l.text)).toEqual([
        'Led the platform team.',
        'Built the billing API.',
      ]);
      for (const line of lines) {
        expect(raw.slice(line.span.start, line.span.end)).toBe(line.text);
        expect(line.span.coordinateSpace).toBe('raw');
        expect(line.sectionKind).toBe('experience');
      }
    });

    it('ignores sections that are not experience, projects, or summary', () => {
      const doc = makeResumeDoc('Python, TypeScript, SQL', 'skills');
      expect(getAccomplishmentLines(doc)).toEqual([]);
    });

    it('skips a first line that merely repeats the section heading', () => {
      const doc = makeResumeDoc('EXPERIENCE\nLed the platform team.');
      doc.sections[0].heading = 'EXPERIENCE';
      const lines = getAccomplishmentLines(doc);
      expect(lines.map((l) => l.text)).toEqual(['Led the platform team.']);
    });

    it('returns nothing when a section span is out of range', () => {
      const doc = makeResumeDoc('Led the platform team.');
      doc.sections[0].span = { coordinateSpace: 'raw', start: 0, end: 9999 };
      expect(getAccomplishmentLines(doc)).toEqual([]);
    });

    it('handles blank lines between accomplishment lines with exact spans', () => {
      const raw = 'Led the platform team.\n\nBuilt the billing API.\n';
      const lines = getAccomplishmentLines(makeResumeDoc(raw));

      // Blank line should not be emitted
      expect(lines.map((l) => l.text)).toEqual([
        'Led the platform team.',
        'Built the billing API.',
      ]);

      // Verify round-trip property: slice matches text for every line
      for (const line of lines) {
        expect(raw.slice(line.span.start, line.span.end)).toBe(line.text);
        expect(line.span.coordinateSpace).toBe('raw');
      }
    });

    it('handles CRLF line endings with exact spans', () => {
      const raw = 'Led the platform team.\r\n  Built the billing API.\r\n';
      const lines = getAccomplishmentLines(makeResumeDoc(raw));

      // No \r should appear in emitted text
      expect(lines.map((l) => l.text)).toEqual([
        'Led the platform team.',
        'Built the billing API.',
      ]);
      for (const line of lines) {
        expect(line.text).not.toContain('\r');
      }

      // Verify round-trip property: slice matches text for every line
      for (const line of lines) {
        expect(raw.slice(line.span.start, line.span.end)).toBe(line.text);
        expect(line.span.coordinateSpace).toBe('raw');
      }
    });
  });

  describe('leadingVerb', () => {
    it('finds the verb past a bullet marker with a raw span', () => {
      const raw = '• helped the support team';
      const [line] = getAccomplishmentLines(makeResumeDoc(raw));
      const verb = leadingVerb(line);

      expect(verb?.verb).toBe('helped');
      expect(raw.slice(verb!.span.start, verb!.span.end)).toBe('helped');
    });

    it('returns null when the line does not begin with a verb', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Senior Platform Engineer'));
      expect(leadingVerb(line)).toBeNull();
    });
  });

  describe('isQuantified', () => {
    it.each([
      'Reduced build time by 40%',
      'Saved $120k per year',
      'Grew signups 3x',
      'Led a team of five engineers',
      'Cut costs by half a million',
    ])('treats "%s" as already quantified', (text) => {
      expect(isQuantified(text)).toBe(true);
    });

    it.each([
      'Reduced build time significantly',
      'Led the platform team',
      'Improved the onboarding flow',
    ])('treats "%s" as un-quantified', (text) => {
      expect(isQuantified(text)).toBe(false);
    });
  });

  describe('classifyObject', () => {
    it('classifies by the first class keyword after the verb', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Helped the support team'));
      expect(classifyObject(line, 'Helped'.length)).toEqual({
        objectClass: 'people',
        keyword: 'team',
      });
    });

    it('matches plural keywords', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Worked on the payment APIs'));
      expect(classifyObject(line, 'Worked'.length)?.objectClass).toBe('system');
    });

    it('returns null when no curated keyword appears', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Handled the paperwork'));
      expect(classifyObject(line, 'Handled'.length)).toBeNull();
    });
  });

  describe('nextTokenAfter', () => {
    it('returns the next word in lowercase', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Worked on the API'));
      expect(nextTokenAfter(line, 'Worked'.length)).toBe('on');
    });
  });
});
