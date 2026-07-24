import { unzipSync } from 'fflate';
import { ExtractedDocument, ExtractedTextBlock } from '../types';
import { makeBlockId } from '../identity-utils';

const MAX_DOCX_SIZE = 10 * 1024 * 1024; // 10MB

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export async function extractDocxDocument(
  buffer: Uint8Array | ArrayBuffer,
  fileName?: string
): Promise<ExtractedDocument> {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (uint8.byteLength > MAX_DOCX_SIZE) {
    return {
      source: {
        type: 'docx',
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

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(uint8);
  } catch (_err) {
    return {
      source: {
        type: 'docx',
        fileName,
        fileSize: uint8.byteLength,
      },
      blocks: [],
      diagnostics: [
        {
          code: 'UNSUPPORTED_FILE',
          severity: 'error',
          message: 'Invalid DOCX format: failed to unzip archive',
        },
      ],
    };
  }

  const docXmlBytes = unzipped['word/document.xml'];
  if (!docXmlBytes) {
    return {
      source: {
        type: 'docx',
        fileName,
        fileSize: uint8.byteLength,
      },
      blocks: [],
      diagnostics: [
        {
          code: 'UNSUPPORTED_FILE',
          severity: 'error',
          message: 'Invalid DOCX file: missing word/document.xml',
        },
      ],
    };
  }

  const xmlText = new TextDecoder('utf-8').decode(docXmlBytes);
  const blocks: ExtractedTextBlock[] = [];

  const tagRegex = /(<\/?[a-zA-Z0-9:]+[^>]*\/?>)|([^<]+)/g;

  let tableIndex = -1;
  let rowIndex = -1;
  let colIndex = -1;
  let inCell = false;
  let inParagraph = false;
  let inText = false;
  let currentText = '';

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xmlText)) !== null) {
    const tag = match[1];
    const textContent = match[2];

    if (tag) {
      const lowerTag = tag.toLowerCase();

      if (lowerTag.startsWith('<w:tbl') && !lowerTag.startsWith('</w:tbl')) {
        tableIndex++;
        rowIndex = -1;
      } else if (lowerTag.startsWith('<w:tr') && !lowerTag.startsWith('</w:tr')) {
        rowIndex++;
        colIndex = -1;
      } else if (lowerTag.startsWith('<w:tc') && !lowerTag.startsWith('</w:tc')) {
        colIndex++;
        inCell = true;
      } else if (lowerTag.startsWith('</w:tc>')) {
        inCell = false;
      } else if (lowerTag.startsWith('<w:p') && !lowerTag.startsWith('</w:p')) {
        inParagraph = true;
        currentText = '';
      } else if (lowerTag.startsWith('</w:p>')) {
        if (inParagraph) {
          inParagraph = false;
          const sourceOrder = blocks.length;
          const page = 1;
          const blockText = currentText;
          const id = makeBlockId(page, sourceOrder, blockText);

          blocks.push({
            id,
            text: blockText,
            page,
            sourceOrder,
            container: inCell
              ? {
                  kind: 'table_cell',
                  tableId: `table_${tableIndex}`,
                  row: rowIndex,
                  column: colIndex,
                }
              : {
                  kind: 'paragraph',
                },
          });
        }
      } else if (lowerTag.startsWith('<w:tab') && inParagraph) {
        currentText += '\t';
      } else if (lowerTag.startsWith('<w:br') && inParagraph) {
        currentText += '\n';
      } else if (lowerTag.startsWith('<w:t') && !lowerTag.startsWith('</w:t')) {
        if (!lowerTag.endsWith('/>')) {
          inText = true;
        }
      } else if (lowerTag.startsWith('</w:t>')) {
        inText = false;
      }
    } else if (textContent && inParagraph && inText) {
      currentText += decodeXmlEntities(textContent);
    }
  }

  return {
    source: {
      type: 'docx',
      fileName,
      fileSize: uint8.byteLength,
    },
    blocks,
    diagnostics: [],
  };
}
