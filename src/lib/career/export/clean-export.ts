import type { ResumeDocument } from '../parser/types.js';
import type { ResumeSuggestion, ResumeExport } from '../analysis/types.js';
import { applyAcceptedSuggestions } from '../suggestions/apply-suggestions.js';

/**
 * Strips Sigil scaffolding (header, footer, and resonance trailer line) from plain text.
 */
function stripSigilScaffolding(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\s*--- SCHOLOMANCE CAREER SIGIL [^\n]*? ---\s*\n?/gm, '')
    .replace(/--- SCHOLOMANCE CAREER SIGIL [^\n]*? ---\n?/g, '')
    .replace(/\s*\[BINDING COMPLETE\]\s*$/g, '')
    .replace(/\[BINDING COMPLETE\]\n?/g, '')
    .replace(/\s*CORE RESONANCE: Specialized in[^\n]*\n?/g, '')
    .replace(/\s*CORE RESONANCE:[^\n]*\n?/g, '')
    .trim();
}

/**
 * Builds a clean résumé export free of any Scholomance Career Sigil artifacts.
 */
export function buildCleanExport(
  doc: ResumeDocument,
  suggestions: ResumeSuggestion[],
  fileName?: string
): ResumeExport {
  const result = applyAcceptedSuggestions(doc, suggestions);
  const plainText = stripSigilScaffolding(result.text);
  const finalFileName = fileName && fileName.trim() ? fileName.trim() : 'resume_export.txt';

  return {
    plainText,
    fileName: finalFileName,
  };
}
