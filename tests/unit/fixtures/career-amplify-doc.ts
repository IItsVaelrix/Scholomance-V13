import type { ResumeDocument } from '../../../src/lib/career/parser/types';

/**
 * Minimal single-section ResumeDocument whose section span covers the whole raw text,
 * so accomplishment-line raw coordinates equal plain string offsets.
 */
export function makeResumeDoc(rawText: string, kind = 'experience'): ResumeDocument {
  return {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'fixture.txt' },
    rawText,
    normalizedText: rawText.toLowerCase(),
    offsetMap: [],
    sections: [
      {
        id: `section:${kind}:0:${rawText.length}`,
        kind: kind as ResumeDocument['sections'][number]['kind'],
        heading: null,
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
