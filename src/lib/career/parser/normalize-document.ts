/**
 * Document normalization utility.
 * Concatenates extracted text blocks, cleans unicode, lowercases text,
 * collapses spaces, and builds character offset mappings between raw and canonical text.
 */

import { ExtractedDocument, OffsetMapping } from './types';

function cleanAndLowercase(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u00A0\u2007\u202F\u3000]/g, ' ')
    .replace(/[\u200B\uFEFF\u00AD]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .toLowerCase();
}

export function normalizeExtractedDocument(extracted: ExtractedDocument): {
  rawText: string;
  normalizedText: string;
  offsetMap: OffsetMapping[];
} {
  const sortedBlocks = [...(extracted.blocks || [])].sort(
    (a, b) => a.sourceOrder - b.sourceOrder
  );

  const rawText = sortedBlocks.map((b) => b.text ?? '').join('\n');

  if (!rawText) {
    return {
      rawText: '',
      normalizedText: '',
      offsetMap: [],
    };
  }

  const offsetMap: OffsetMapping[] = [];
  let currentCanonicalIndex = 0;
  let normalizedAccumulator = '';

  const tokenRegex = /(\s+)|([^\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(rawText)) !== null) {
    const matchedText = match[0];
    const rawStart = match.index;
    const rawEnd = rawStart + matchedText.length;

    const isWhitespace = match[1] !== undefined;

    if (isWhitespace) {
      if (normalizedAccumulator.length > 0) {
        normalizedAccumulator += ' ';
        const canonicalStart = currentCanonicalIndex;
        const canonicalEnd = currentCanonicalIndex + 1;
        currentCanonicalIndex = canonicalEnd;

        offsetMap.push({
          rawStart,
          rawEnd,
          canonicalStart,
          canonicalEnd,
        });
      } else {
        offsetMap.push({
          rawStart,
          rawEnd,
          canonicalStart: 0,
          canonicalEnd: 0,
        });
      }
    } else {
      const cleaned = cleanAndLowercase(matchedText);
      normalizedAccumulator += cleaned;
      const canonicalStart = currentCanonicalIndex;
      const canonicalEnd = currentCanonicalIndex + cleaned.length;
      currentCanonicalIndex = canonicalEnd;

      offsetMap.push({
        rawStart,
        rawEnd,
        canonicalStart,
        canonicalEnd,
      });
    }
  }

  let normalizedText = normalizedAccumulator;
  if (normalizedText.endsWith(' ')) {
    normalizedText = normalizedText.slice(0, -1);
    const lastMap = offsetMap[offsetMap.length - 1];
    if (lastMap && lastMap.canonicalStart < lastMap.canonicalEnd) {
      lastMap.canonicalEnd = lastMap.canonicalStart;
    }
  }

  return {
    rawText,
    normalizedText,
    offsetMap,
  };
}
