import {
  OffsetMapping,
  ParseDiagnostic,
  ResumeContact,
  ResumeDocument,
  ResumeSection,
  ResumeSourceMetadata,
} from './types';

export function calculateParseConfidence(params: {
  rawText: string;
  sections: ResumeSection[];
  contact: ResumeContact;
}): number {
  const { rawText, sections, contact } = params;
  if (!rawText || !rawText.trim()) {
    return 0;
  }

  let score = 0.1; // Base score for non-empty text

  // Contact info score (max 0.45)
  if (contact.email) score += 0.2;
  if (contact.phone) score += 0.1;
  if (contact.name) score += 0.1;
  if (contact.links && contact.links.length > 0) score += 0.05;

  // Sections score (max 0.45)
  const kinds = new Set(sections.map((s) => s.kind));
  if (kinds.has('experience')) score += 0.2;
  if (kinds.has('education')) score += 0.1;
  if (kinds.has('skills')) score += 0.1;
  if (kinds.has('summary') || kinds.has('projects')) score += 0.05;

  return Math.min(1.0, Math.max(0, Math.round(score * 100) / 100));
}

export function validateResumeDocument(params: {
  source: ResumeSourceMetadata;
  rawText: string;
  normalizedText: string;
  offsetMap: OffsetMapping[];
  sections: ResumeSection[];
  contact: ResumeContact;
  diagnostics: ParseDiagnostic[];
}): ResumeDocument {
  const confidence = calculateParseConfidence({
    rawText: params.rawText,
    sections: params.sections,
    contact: params.contact,
  });

  const doc: ResumeDocument = {
    schemaVersion: 1,
    source: params.source,
    rawText: params.rawText,
    normalizedText: params.normalizedText,
    offsetMap: params.offsetMap,
    sections: params.sections,
    contact: params.contact,
    diagnostics: params.diagnostics,
    confidence,
  };

  return Object.freeze(doc);
}
