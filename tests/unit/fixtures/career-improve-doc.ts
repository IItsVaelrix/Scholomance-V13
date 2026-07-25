import type { ResumeDocument, ResumeSectionKind } from '../../../src/lib/career/parser/types';

/**
 * Single-section ResumeDocument whose section span covers the whole raw text, so bullet
 * source-spans equal plain string offsets. When `heading` is given, `rawText` is expected
 * to start with that heading line (segmentBullets skips it).
 */
export function makeImproveDoc(
  rawText: string,
  kind: ResumeSectionKind = 'experience',
  heading: string | null = null
): ResumeDocument {
  return {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'fixture.txt' },
    rawText,
    normalizedText: rawText.toLowerCase(),
    offsetMap: [],
    sections: [
      {
        id: `section:${kind}:0:${rawText.length}`,
        kind,
        heading,
        text: rawText,
        span: { coordinateSpace: 'raw', start: 0, end: rawText.length },
        confidence: 0.9,
        evidence: [],
      },
    ],
    contact: { links: [] },
    diagnostics: [],
    confidence: 0.9,
  };
}

/** A two-section doc (summary + experience) for add-section / cross-section tests. */
export function makeTwoSectionDoc(
  summaryText: string,
  experienceText: string
): ResumeDocument {
  const rawText = `${summaryText}\n${experienceText}`;
  const summaryEnd = summaryText.length;
  return {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'fixture.txt' },
    rawText,
    normalizedText: rawText.toLowerCase(),
    offsetMap: [],
    sections: [
      {
        id: `section:summary:0:${summaryEnd}`,
        kind: 'summary',
        heading: null,
        text: summaryText,
        span: { coordinateSpace: 'raw', start: 0, end: summaryEnd },
        confidence: 0.9,
        evidence: [],
      },
      {
        id: `section:experience:${summaryEnd}:${rawText.length}`,
        kind: 'experience',
        heading: null,
        text: experienceText,
        span: { coordinateSpace: 'raw', start: summaryEnd, end: rawText.length },
        confidence: 0.9,
        evidence: [],
      },
    ],
    contact: { links: [] },
    diagnostics: [],
    confidence: 0.9,
  };
}
