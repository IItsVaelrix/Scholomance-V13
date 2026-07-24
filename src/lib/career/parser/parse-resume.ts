import {
  ResumeSourceType,
  ResumeDocument,
  ExtractedDocument,
} from './types';
import { extractPastedText } from './adapters/pasted-text';
import { extractPlainText } from './adapters/plain-text';
import { extractDocxDocument } from './adapters/docx';
import { extractPdfDocument } from './adapters/pdf';
import { normalizeExtractedDocument } from './normalize-document';
import { extractContactFields } from './extract-contact';
import { detectResumeSections } from './detect-sections';
import { validateResumeDocument } from './validate-parse';

export interface ResumeSource {
  type: ResumeSourceType;
  content: string | Uint8Array | ArrayBuffer;
  fileName?: string;
}

export async function parseResumeSource(
  source: ResumeSource
): Promise<ResumeDocument> {
  let extracted: ExtractedDocument;

  switch (source.type) {
    case 'paste': {
      const textContent =
        typeof source.content === 'string'
          ? source.content
          : new TextDecoder('utf-8').decode(source.content);
      extracted = extractPastedText(textContent);
      break;
    }
    case 'txt': {
      extracted = extractPlainText(source.content, source.fileName);
      break;
    }
    case 'docx': {
      extracted = await extractDocxDocument(
        source.content as Uint8Array | ArrayBuffer,
        source.fileName
      );
      break;
    }
    case 'pdf': {
      extracted = await extractPdfDocument(
        source.content as Uint8Array | ArrayBuffer,
        source.fileName
      );
      break;
    }
    default: {
      throw new Error(`Unsupported resume source type: ${(source as any).type}`);
    }
  }

  const { rawText, normalizedText, offsetMap } =
    normalizeExtractedDocument(extracted);
  const contact = extractContactFields(rawText);
  const sections = detectResumeSections(rawText, offsetMap);

  return validateResumeDocument({
    source: extracted.source,
    rawText,
    normalizedText,
    offsetMap,
    sections,
    contact,
    diagnostics: extracted.diagnostics,
  });
}
