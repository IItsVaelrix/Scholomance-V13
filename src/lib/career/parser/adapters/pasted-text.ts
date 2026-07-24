import { ExtractedDocument, ExtractedTextBlock } from '../types';
import { makeBlockId } from '../identity-utils';

export function extractPastedText(content: string): ExtractedDocument {
  const safeContent = content ?? '';
  const lines = safeContent.split(/\r?\n/);
  const blocks: ExtractedTextBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const sourceOrder = i;
    const page = 1;
    const id = makeBlockId(page, sourceOrder, text);

    blocks.push({
      id,
      text,
      page,
      sourceOrder,
      container: {
        kind: 'paragraph',
      },
    });
  }

  return {
    source: {
      type: 'paste',
      fileSize: Buffer.byteLength(safeContent, 'utf-8'),
    },
    blocks,
    diagnostics: [],
  };
}
