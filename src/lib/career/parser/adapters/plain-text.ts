import { ExtractedDocument, ExtractedTextBlock } from '../types';
import { makeBlockId } from '../identity-utils';

export function extractPlainText(
  content: string | Uint8Array,
  fileName?: string
): ExtractedDocument {
  let strContent: string;
  let fileSize: number;

  if (typeof content === 'string') {
    strContent = content;
    fileSize = Buffer.byteLength(content, 'utf-8');
  } else {
    strContent = new TextDecoder('utf-8').decode(content);
    fileSize = content.byteLength;
  }

  const lines = strContent.split(/\r?\n/);
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
      type: 'txt',
      fileName,
      fileSize,
    },
    blocks,
    diagnostics: [],
  };
}
