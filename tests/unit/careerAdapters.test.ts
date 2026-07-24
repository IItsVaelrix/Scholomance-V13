import { describe, it, expect } from 'vitest';
import { zipSync, strToU8, deflateSync } from 'fflate';
import { extractPastedText } from '../../src/lib/career/parser/adapters/pasted-text';
import { extractPlainText } from '../../src/lib/career/parser/adapters/plain-text';
import { extractDocxDocument } from '../../src/lib/career/parser/adapters/docx';
import { extractPdfDocument } from '../../src/lib/career/parser/adapters/pdf';
import { parseResumeSource } from '../../src/lib/career/parser/parse-resume';
import { makeBlockId } from '../../src/lib/career/parser/identity-utils';

describe('Pasted Text Adapter', () => {
  it('extracts text blocks line by line with deterministic block IDs', () => {
    const rawContent = 'Jane Doe\nSoftware Engineer\nJane@example.com';
    const result = extractPastedText(rawContent);

    expect(result.source.type).toBe('paste');
    expect(result.blocks.length).toBe(3);
    expect(result.blocks[0].text).toBe('Jane Doe');
    expect(result.blocks[0].id).toBe(makeBlockId(1, 0, 'Jane Doe'));
    expect(result.blocks[1].text).toBe('Software Engineer');
    expect(result.blocks[1].id).toBe(makeBlockId(1, 1, 'Software Engineer'));
    expect(result.blocks[2].text).toBe('Jane@example.com');
    expect(result.blocks[2].id).toBe(makeBlockId(1, 2, 'Jane@example.com'));
    expect(result.diagnostics).toEqual([]);
  });

  it('handles empty pasted text content', () => {
    const result = extractPastedText('');
    expect(result.source.type).toBe('paste');
    expect(result.blocks.length).toBe(1);
    expect(result.blocks[0].text).toBe('');
  });
});

describe('Plain Text Adapter', () => {
  it('extracts string content correctly', () => {
    const content = 'Jane Doe\nEXPERIENCE\nSoftware Dev';
    const result = extractPlainText(content, 'resume.txt');

    expect(result.source.type).toBe('txt');
    expect(result.source.fileName).toBe('resume.txt');
    expect(result.blocks.length).toBe(3);
    expect(result.blocks[0].text).toBe('Jane Doe');
  });

  it('extracts Uint8Array content correctly', () => {
    const text = 'Jane Doe\nemail@example.com';
    const bytes = new TextEncoder().encode(text);
    const result = extractPlainText(bytes, 'binary_resume.txt');

    expect(result.source.type).toBe('txt');
    expect(result.source.fileName).toBe('binary_resume.txt');
    expect(result.blocks.length).toBe(2);
    expect(result.blocks[0].text).toBe('Jane Doe');
    expect(result.blocks[1].text).toBe('email@example.com');
  });
});

describe('DOCX Adapter (fflate)', () => {
  function createMockDocx(xmlContent: string): Uint8Array {
    const files: Record<string, Uint8Array> = {
      'word/document.xml': strToU8(xmlContent),
    };
    return zipSync(files);
  }

  it('extracts paragraphs, tabs, breaks, and XML text from word/document.xml', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Jane Doe</w:t></w:r>
      <w:r><w:tab/><w:t>Senior Architect</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Line 1</w:t><w:br/><w:t>Line 2</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

    const docxBuffer = createMockDocx(xml);
    const result = await extractDocxDocument(docxBuffer, 'test.docx');

    expect(result.source.type).toBe('docx');
    expect(result.source.fileName).toBe('test.docx');
    expect(result.blocks.length).toBe(2);
    expect(result.blocks[0].text).toBe('Jane Doe\tSenior Architect');
    expect(result.blocks[1].text).toBe('Line 1\nLine 2');
  });

  it('preserves table cell container structure', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Company A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2020 - 2022</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const docxBuffer = createMockDocx(xml);
    const result = await extractDocxDocument(docxBuffer, 'table.docx');

    expect(result.blocks.length).toBe(2);
    expect(result.blocks[0].text).toBe('Company A');
    expect(result.blocks[0].container?.kind).toBe('table_cell');
    expect(result.blocks[0].container?.row).toBe(0);
    expect(result.blocks[0].container?.column).toBe(0);

    expect(result.blocks[1].text).toBe('2020 - 2022');
    expect(result.blocks[1].container?.kind).toBe('table_cell');
    expect(result.blocks[1].container?.row).toBe(0);
    expect(result.blocks[1].container?.column).toBe(1);
  });

  it('enforces 10MB file limit with UNSUPPORTED_FILE diagnostic', async () => {
    const oversizedBuffer = new Uint8Array(10 * 1024 * 1024 + 1);
    const result = await extractDocxDocument(oversizedBuffer, 'huge.docx');

    expect(result.blocks).toEqual([]);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0].code).toBe('UNSUPPORTED_FILE');
    expect(result.diagnostics[0].severity).toBe('error');
  });
});

describe('PDF Adapter (OCR Refusal & Stream Parsing)', () => {
  it('extracts text streams (BT ... ET, Tj, TJ)', async () => {
    const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 100 >>
stream
BT
/F1 12 Tf
(Jane Doe) Tj
ET
BT
[(Senior ) -10 (Engineer)] TJ
ET
endstream
endobj
%%EOF`;

    const pdfBuffer = new TextEncoder().encode(pdfString);
    const result = await extractPdfDocument(pdfBuffer, 'resume.pdf');

    expect(result.source.type).toBe('pdf');
    expect(result.source.fileName).toBe('resume.pdf');
    expect(result.blocks.length).toBe(2);
    expect(result.blocks[0].text).toBe('Jane Doe');
    expect(result.blocks[1].text).toBe('Senior Engineer');
    expect(result.diagnostics).toEqual([]);
  });

  it('extracts text from compressed PDF streams (/FlateDecode)', async () => {
    const streamContent = `BT\n(Compressed Text) Tj\nET`;
    const compressed = deflateSync(strToU8(streamContent));

    const header = `%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`;
    const footer = `\nendstream\nendobj\n%%EOF`;

    const headerBytes = strToU8(header);
    const footerBytes = strToU8(footer);

    const pdfBytes = new Uint8Array(headerBytes.length + compressed.length + footerBytes.length);
    pdfBytes.set(headerBytes, 0);
    pdfBytes.set(compressed, headerBytes.length);
    pdfBytes.set(footerBytes, headerBytes.length + compressed.length);

    const result = await extractPdfDocument(pdfBytes, 'compressed.pdf');

    expect(result.blocks.length).toBe(1);
    expect(result.blocks[0].text).toBe('Compressed Text');
  });

  it('triggers IMAGE_ONLY_PDF error diagnostic when no text layer exists', async () => {
    const imageOnlyPdf = `%PDF-1.4
1 0 obj
<< /Type /Page >>
endobj
2 0 obj
<< /Type /XObject /Subtype /Image >>
stream
BINARY_IMAGE_DATA_HERE
endstream
endobj
%%EOF`;

    const pdfBuffer = new TextEncoder().encode(imageOnlyPdf);
    const result = await extractPdfDocument(pdfBuffer, 'scanned.pdf');

    expect(result.blocks).toEqual([]);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0].code).toBe('IMAGE_ONLY_PDF');
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].message).toContain('No machine-readable text layer was detected');
  });

  it('enforces 10-page limit with UNSUPPORTED_FILE diagnostic', async () => {
    let pagesPdf = `%PDF-1.4\n`;
    for (let i = 0; i < 11; i++) {
      pagesPdf += `${i + 1} 0 obj\n<< /Type /Page >>\nendobj\n`;
    }
    pagesPdf += `%%EOF`;

    const pdfBuffer = new TextEncoder().encode(pagesPdf);
    const result = await extractPdfDocument(pdfBuffer, 'long.pdf');

    expect(result.blocks).toEqual([]);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0].code).toBe('UNSUPPORTED_FILE');
    expect(result.diagnostics[0].severity).toBe('error');
  });

  it('enforces 10MB file limit with UNSUPPORTED_FILE diagnostic', async () => {
    const oversizedPdf = new Uint8Array(10 * 1024 * 1024 + 1);
    const result = await extractPdfDocument(oversizedPdf, 'huge.pdf');

    expect(result.blocks).toEqual([]);
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0].code).toBe('UNSUPPORTED_FILE');
  });
});

describe('PDF Adapter (Multi-Column Layout Detection)', () => {
  // Two text clusters: left column at x=72, right column at x=330.
  const twoColumnPdf = `%PDF-1.4
1 0 obj
<< /Type /Page >>
endobj
2 0 obj
<< /Length 300 >>
stream
BT /F1 11 Tf 1 0 0 1 72 700 Tm (Managed backend services) Tj ET
BT /F1 11 Tf 1 0 0 1 72 680 Tm (Built REST APIs) Tj ET
BT /F1 11 Tf 1 0 0 1 330 700 Tm (JavaScript) Tj ET
BT /F1 11 Tf 1 0 0 1 330 680 Tm (Python) Tj ET
endstream
endobj
%%EOF`;

  // One text cluster: everything at x=72.
  const singleColumnPdf = `%PDF-1.4
1 0 obj
<< /Type /Page >>
endobj
2 0 obj
<< /Length 200 >>
stream
BT /F1 11 Tf 1 0 0 1 72 700 Tm (Managed backend services) Tj ET
BT /F1 11 Tf 1 0 0 1 72 680 Tm (Built REST APIs in JavaScript) Tj ET
BT /F1 11 Tf 1 0 0 1 72 660 Tm (Wrote Python tooling) Tj ET
endstream
endobj
%%EOF`;

  it('emits MULTI_COLUMN_LAYOUT diagnostic when text forms two x-clusters', async () => {
    const result = await extractPdfDocument(new TextEncoder().encode(twoColumnPdf), 'two-col.pdf');
    const diag = result.diagnostics.find((d) => d.code === 'MULTI_COLUMN_LAYOUT');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning');
  });

  it('does NOT emit MULTI_COLUMN_LAYOUT for a single-column layout', async () => {
    const result = await extractPdfDocument(new TextEncoder().encode(singleColumnPdf), 'one-col.pdf');
    const diag = result.diagnostics.find((d) => d.code === 'MULTI_COLUMN_LAYOUT');
    expect(diag).toBeUndefined();
  });

  it('does NOT emit MULTI_COLUMN_LAYOUT for a single-column body with a multi-line sub-indent', async () => {
    // Left-aligned body at x=72 with a sub-indented bullet list at x=128 (56pt
    // in). That is one logical column with hanging indentation, not two columns
    // — the gap is far narrower than a real résumé gutter.
    const subIndentPdf = `%PDF-1.4
1 0 obj
<< /Type /Page >>
endobj
2 0 obj
<< /Length 400 >>
stream
BT /F1 11 Tf 1 0 0 1 72 700 Tm (Led the platform team and shipped) Tj ET
BT /F1 11 Tf 1 0 0 1 72 680 Tm (Owned the billing rewrite end to end) Tj ET
BT /F1 11 Tf 1 0 0 1 72 660 Tm (Highlights included:) Tj ET
BT /F1 11 Tf 1 0 0 1 128 640 Tm (cut latency by forty percent) Tj ET
BT /F1 11 Tf 1 0 0 1 128 620 Tm (migrated to a new datastore) Tj ET
endstream
endobj
%%EOF`;
    const result = await extractPdfDocument(new TextEncoder().encode(subIndentPdf), 'sub-indent.pdf');
    const diag = result.diagnostics.find((d) => d.code === 'MULTI_COLUMN_LAYOUT');
    expect(diag).toBeUndefined();
  });

  it('does NOT emit MULTI_COLUMN_LAYOUT for a multi-line centered header above the body', async () => {
    // A 2-line centered contact block (x=250, high on the page) sitting ABOVE
    // left-aligned body (x=72). Both form clusters with >=2 lines, but they do
    // not overlap vertically — a header is not a column. Distance alone cannot
    // distinguish this from a real column; vertical coexistence can.
    const centeredHeaderPdf = `%PDF-1.4
1 0 obj
<< /Type /Page >>
endobj
2 0 obj
<< /Length 300 >>
stream
BT /F1 11 Tf 1 0 0 1 250 720 Tm (123 Main Street, Springfield) Tj ET
BT /F1 11 Tf 1 0 0 1 250 705 Tm (jane@example.com  555-1212) Tj ET
BT /F1 11 Tf 1 0 0 1 72 670 Tm (Managed backend services) Tj ET
BT /F1 11 Tf 1 0 0 1 72 650 Tm (Built REST APIs) Tj ET
endstream
endobj
%%EOF`;
    const result = await extractPdfDocument(new TextEncoder().encode(centeredHeaderPdf), 'centered.pdf');
    expect(result.diagnostics.find((d) => d.code === 'MULTI_COLUMN_LAYOUT')).toBeUndefined();
  });

  it('emits MULTI_COLUMN_LAYOUT for two vertically-overlapping columns left of page center', async () => {
    // Genuine two-column layout whose columns both sit left of x=250 (skills at
    // x=60, experience at x=200) and run down the page together. A center-line
    // heuristic would miss this; vertical overlap catches it.
    const narrowColumnsPdf = `%PDF-1.4
1 0 obj
<< /Type /Page >>
endobj
2 0 obj
<< /Length 300 >>
stream
BT /F1 11 Tf 1 0 0 1 60 700 Tm (Skills) Tj ET
BT /F1 11 Tf 1 0 0 1 60 680 Tm (Python and Rust) Tj ET
BT /F1 11 Tf 1 0 0 1 200 700 Tm (Experience at Acme Corp) Tj ET
BT /F1 11 Tf 1 0 0 1 200 680 Tm (Shipped the billing rewrite) Tj ET
endstream
endobj
%%EOF`;
    const result = await extractPdfDocument(new TextEncoder().encode(narrowColumnsPdf), 'narrow.pdf');
    const diag = result.diagnostics.find((d) => d.code === 'MULTI_COLUMN_LAYOUT');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning');
  });

  it('records the horizontal position of each text run in block.bbox.x', async () => {
    const result = await extractPdfDocument(new TextEncoder().encode(twoColumnPdf), 'two-col.pdf');
    const leftBlock = result.blocks.find((b) => b.text.includes('Managed backend'));
    const rightBlock = result.blocks.find((b) => b.text.includes('JavaScript'));
    expect(leftBlock?.bbox?.x).toBe(72);
    expect(rightBlock?.bbox?.x).toBe(330);
  });
});

describe('parseResumeSource Pipeline', () => {
  it('parses pasted text end-to-end into a validated frozen ResumeDocument', async () => {
    const content = `Jane Doe
jane.doe@example.com
555-123-4567

WORK EXPERIENCE
Senior Developer
Built high-performance web applications using TypeScript and React.

SKILLS
TypeScript, React, Node.js`;

    const doc = await parseResumeSource({
      type: 'paste',
      content,
    });

    expect(Object.isFrozen(doc)).toBe(true);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.source.type).toBe('paste');
    expect(doc.contact.name).toBe('Jane Doe');
    expect(doc.contact.email).toBe('jane.doe@example.com');
    expect(doc.contact.phone).toBe('555-123-4567');
    expect(doc.sections.length).toBeGreaterThan(0);
    expect(doc.confidence).toBeGreaterThan(0);
  });

  it('parses TXT source end-to-end', async () => {
    const content = `John Smith\njohn@example.com\n\nEXPERIENCE\nSoftware Engineer`;
    const doc = await parseResumeSource({
      type: 'txt',
      content,
      fileName: 'resume.txt',
    });

    expect(doc.source.type).toBe('txt');
    expect(doc.source.fileName).toBe('resume.txt');
    expect(doc.contact.email).toBe('john@example.com');
  });
});
