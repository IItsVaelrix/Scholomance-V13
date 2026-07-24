import { inflateSync } from 'fflate';
import { ExtractedDocument, ExtractedTextBlock, ParseDiagnostic } from '../types';
import { makeBlockId } from '../identity-utils';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_PAGES = 10;

function unescapePdfString(str: string): string {
  return str.replace(/\\([0-7]{1,3}|[\\()nrtbf])/g, (_, esc) => {
    if (esc === '\\') return '\\';
    if (esc === '(') return '(';
    if (esc === ')') return ')';
    if (esc === 'n') return '\n';
    if (esc === 'r') return '\r';
    if (esc === 't') return '\t';
    if (esc === 'b') return '\b';
    if (esc === 'f') return '\f';
    if (/^[0-7]{1,3}$/.test(esc)) {
      return String.fromCharCode(parseInt(esc, 8));
    }
    return esc;
  });
}

function decodePdfHexString(hexStr: string): string {
  const cleanHex = hexStr.replace(/[^0-9a-fA-F]/g, '');
  let result = '';
  for (let i = 0; i < cleanHex.length; i += 2) {
    const hex = cleanHex.slice(i, i + 2);
    if (hex.length === 1) {
      result += String.fromCharCode(parseInt(hex + '0', 16));
    } else {
      result += String.fromCharCode(parseInt(hex, 16));
    }
  }
  return result;
}

function parseTextFromBtEt(btEtContent: string): string {
  let result = '';

  // Match Tj operator: (string) Tj or <hex> Tj
  const tjRegex = /(?:\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>)\s*Tj/g;
  // Match TJ operator: [ ... ] TJ
  const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;

  let match: RegExpExecArray | null;

  // Process TJ arrays first
  while ((match = tjArrayRegex.exec(btEtContent)) !== null) {
    const arrayContent = match[1];
    const itemRegex = /\(((?:[^()\\]|\\.)*)\)|<([0-9a-fA-F\s]*)>|(-?\d+(?:\.\d+)?)/g;
    let itemMatch: RegExpExecArray | null;

    while ((itemMatch = itemRegex.exec(arrayContent)) !== null) {
      const strLiteral = itemMatch[1];
      const hexLiteral = itemMatch[2];
      const numValue = itemMatch[3];

      if (strLiteral !== undefined) {
        result += unescapePdfString(strLiteral);
      } else if (hexLiteral !== undefined) {
        result += decodePdfHexString(hexLiteral);
      } else if (numValue !== undefined) {
        const offset = parseFloat(numValue);
        if (offset < -100 && result.length > 0 && !/\s$/.test(result)) {
          result += ' ';
        }
      }
    }
  }

  // Process Tj operators
  while ((match = tjRegex.exec(btEtContent)) !== null) {
    const matched = match[0].trim();
    if (matched.startsWith('(')) {
      const strContent = matched.slice(1, matched.lastIndexOf(')'));
      result += unescapePdfString(strContent);
    } else if (matched.startsWith('<')) {
      const hexContent = matched.slice(1, matched.lastIndexOf('>'));
      result += decodePdfHexString(hexContent);
    }
  }

  return result;
}

export async function extractPdfDocument(
  buffer: Uint8Array | ArrayBuffer,
  fileName?: string
): Promise<ExtractedDocument> {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (uint8.byteLength > MAX_PDF_SIZE) {
    return {
      source: {
        type: 'pdf',
        fileName,
        fileSize: uint8.byteLength,
      },
      blocks: [],
      diagnostics: [
        {
          code: 'UNSUPPORTED_FILE',
          severity: 'error',
          message: 'File size exceeds 10MB limit',
        },
      ],
    };
  }

  const rawText = new TextDecoder('latin1').decode(uint8);

  // Detect page count
  const pageMatches = rawText.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  if (pageCount > MAX_PDF_PAGES) {
    return {
      source: {
        type: 'pdf',
        fileName,
        fileSize: uint8.byteLength,
        pageCount,
      },
      blocks: [],
      diagnostics: [
        {
          code: 'UNSUPPORTED_FILE',
          severity: 'error',
          message: `PDF exceeds ${MAX_PDF_PAGES}-page limit (found ${pageCount} pages)`,
        },
      ],
    };
  }

  // Decompress streams if needed
  let fullExtractedText = rawText;

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch: RegExpExecArray | null;

  while ((streamMatch = streamRegex.exec(rawText)) !== null) {
    const streamStartIndex = streamMatch.index;
    const headerSlice = rawText.slice(Math.max(0, streamStartIndex - 300), streamStartIndex);

    if (/\/Filter\s*\/FlateDecode/i.test(headerSlice)) {
      const matchStart = streamStartIndex + streamMatch[0].indexOf('\n') + 1;
      const matchEnd = streamStartIndex + streamMatch[0].lastIndexOf('endstream');
      const streamBytes = uint8.subarray(matchStart, matchEnd);

      try {
        const decompressedBytes = inflateSync(streamBytes);
        const decompressedText = new TextDecoder('latin1').decode(decompressedBytes);
        fullExtractedText += '\n' + decompressedText;
      } catch (_err) {
        // Fallback: continue with uncompressed content if inflate fails
      }
    }
  }

  const blocks: ExtractedTextBlock[] = [];
  const btEtRegex = /\bBT\b([\s\S]*?)\bET\b/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btEtRegex.exec(fullExtractedText)) !== null) {
    const btContent = btMatch[1];
    const text = parseTextFromBtEt(btContent);

    if (text && text.trim().length > 0) {
      const sourceOrder = blocks.length;
      const page = 1;
      const id = makeBlockId(page, sourceOrder, text);

      let bbox: { x: number; y: number; width: number; height: number } | undefined = undefined;
      // Match Tm operator: 1 0 0 1 x y Tm or 1 0 0 1 x y cm
      const tmMatch = /(?:1\s+0\s+0\s+1\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(?:Tm|cm))|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td/.exec(btContent);
      if (tmMatch) {
        const xStr = tmMatch[1] ?? tmMatch[3];
        const yStr = tmMatch[2] ?? tmMatch[4];
        if (xStr !== undefined && yStr !== undefined) {
          bbox = {
            x: parseFloat(xStr),
            y: parseFloat(yStr),
            width: 0,
            height: 0,
          };
        }
      }

      blocks.push({
        id,
        text,
        page,
        sourceOrder,
        bbox,
        container: {
          kind: 'paragraph',
        },
      });
    }
  }

  const diagnostics: ParseDiagnostic[] = [];

  if (blocks.length === 0) {
    diagnostics.push({
      code: 'IMAGE_ONLY_PDF',
      severity: 'error',
      message: 'No machine-readable text layer was detected. Upload a text-based PDF, DOCX, TXT, or paste the résumé.',
    });
  } else {
    // Detect multi-column layout from x-coordinates
    const leftColBlocks = blocks.filter((b) => typeof b.bbox?.x === 'number' && b.bbox.x < 250);
    const rightColBlocks = blocks.filter((b) => typeof b.bbox?.x === 'number' && b.bbox.x >= 250);

    if (leftColBlocks.length >= 2 && rightColBlocks.length >= 2) {
      diagnostics.push({
        code: 'MULTI_COLUMN_LAYOUT',
        severity: 'warning',
        message: 'Multi-column PDF layout detected; reading order may be fragmented across columns.',
      });
    }
  }

  return {
    source: {
      type: 'pdf',
      fileName,
      fileSize: uint8.byteLength,
      pageCount,
    },
    blocks,
    diagnostics,
  };
}

