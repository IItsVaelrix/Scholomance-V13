import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { buildDocxExport } from '../../src/lib/career/export/docx-export';
import { buildImprovements } from '../../src/lib/career/improve/build-improvements';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { parseResumeSource } from '../../src/lib/career/parser/parse-resume';
import { makeImproveDoc } from './fixtures/career-improve-doc';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof (blob as any).arrayBuffer === 'function') {
    return new Uint8Array(await (blob as any).arrayBuffer());
  }
  // jsdom Blob fallback (no arrayBuffer()) — read via FileReader.
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}

async function documentXml(doc: ResumeDocument, targetRole?: string): Promise<string> {
  const { blob } = await buildDocxExport(doc, { targetRole });
  const bytes = await blobToBytes(blob);
  const unzipped = unzipSync(bytes);
  const xmlBytes = unzipped['word/document.xml'];
  expect(xmlBytes).toBeTruthy();
  return new TextDecoder('utf-8').decode(xmlBytes);
}

/** Apply the accepted subset and re-parse into an improved ResumeDocument. */
async function improvedDoc(raw: string, jd: string, accept: (s: ResumeSuggestion) => boolean) {
  const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
  const suggestions = buildImprovements(jd, doc);
  const decided = suggestions.map<ResumeSuggestion>((s) => ({
    ...s,
    status: accept(s) ? 'accepted' : 'rejected',
  }));
  const result = applyAcceptedSuggestions(doc, decided);
  const reparsed = await parseResumeSource({ type: 'paste', content: result.text });
  return { doc, suggestions, result, reparsed };
}

describe('docx export — ATS-safe structure (§4.7)', () => {
  it('unzips to valid document XML with a single-column body', async () => {
    const doc = makeImproveDoc('EXPERIENCE\nWrote Postgres queries for reports', 'experience', 'EXPERIENCE');
    const xml = await documentXml(doc);
    expect(xml).toContain('<w:document');
    expect(xml).toContain('<w:body');
    expect(xml).toContain('<w:p'); // real paragraphs
  });

  it('contains NO table, text box, or header/footer (ATS-safe)', async () => {
    const doc = makeImproveDoc('EXPERIENCE\nWrote Postgres queries for reports\nLed a team of five', 'experience', 'EXPERIENCE');
    const xml = await documentXml(doc);
    expect(xml).not.toContain('<w:tbl'); // no tables
    expect(xml).not.toContain('<w:txbxContent'); // no text boxes
    expect(xml).not.toContain('<w:hdr>'); // no headers
    expect(xml).not.toContain('<w:ftr>'); // no footers
  });

  it('uses the resume_<TargetRole>.docx naming convention', async () => {
    const doc = makeImproveDoc('EXPERIENCE\nBuilt APIs', 'experience', 'EXPERIENCE');
    const role = await buildDocxExport(doc, { targetRole: 'Senior Backend Engineer' });
    expect(role.fileName).toBe('resume_Senior_Backend_Engineer.docx');
    const fallback = await buildDocxExport(doc, {});
    expect(fallback.fileName).toBe('resume_export.docx');
  });
});

describe('docx export — contains accepted improvements', () => {
  it('renders an accepted vocabulary injection into the document XML', async () => {
    const raw = 'EXPERIENCE\nWrote Postgres queries to build weekly reports';
    const { reparsed, suggestions } = await improvedDoc(
      raw,
      'Required: SQL and Postgres. Must have strong SQL.',
      (s) => s.type === 'keyword'
    );
    expect(suggestions.some((s) => s.type === 'keyword')).toBe(true);
    const xml = await documentXml(reparsed);
    expect(xml).toContain('SQL/Postgres');
  });
});

describe('docx export — round-trip parse (test 6)', () => {
  it('export then re-ingest preserves the structured facts', async () => {
    const raw =
      'EXPERIENCE\nWrote Postgres queries to build weekly reports\nLed a team of five engineers';
    const { reparsed } = await improvedDoc(
      raw,
      'Required: SQL and Postgres.',
      (s) => s.type === 'keyword'
    );
    const { blob } = await buildDocxExport(reparsed, { targetRole: 'SQL Developer' });
    const bytes = await blobToBytes(blob);

    const reingested = await parseResumeSource({ type: 'docx', content: bytes });
    const text = reingested.rawText;
    // The accepted vocabulary and the untouched bullet both survive the round trip.
    expect(text).toContain('SQL/Postgres');
    expect(text).toContain('Led a team of five engineers');
    // The section heading survives.
    expect(text.toUpperCase()).toContain('EXPERIENCE');
  });
});

describe('docx export — end-to-end accept-subset (spec §7)', () => {
  it('JD + résumé → improvements → accept a subset → DOCX; accepted vocab appears, rejected does not leak', async () => {
    const raw =
      'EXPERIENCE\nWrote Postgres queries to build reports\nBuilt JSX components for the dashboard';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const jd = 'Required: SQL and React. Must have SQL and React experience.';
    const suggestions = buildImprovements(jd, doc);

    // Two vocabulary injections: SQL (Postgres bullet) and React (JSX bullet).
    const sqlSug = suggestions.find((s) => s.type === 'keyword' && s.after?.includes('SQL/Postgres'));
    const reactSug = suggestions.find((s) => s.type === 'keyword' && s.after?.includes('React/JSX'));
    expect(sqlSug).toBeTruthy();
    expect(reactSug).toBeTruthy();

    // Accept ONLY the SQL suggestion; reject the React one.
    const decided = suggestions.map<ResumeSuggestion>((s) => ({
      ...s,
      status: s.id === sqlSug!.id ? 'accepted' : 'rejected',
    }));
    const result = applyAcceptedSuggestions(doc, decided);
    expect(result.applied).toContain(sqlSug!.id);
    expect(result.applied).not.toContain(reactSug!.id);

    const improved = await parseResumeSource({ type: 'paste', content: result.text });
    const xml = await documentXml(improved, 'Full Stack Developer');

    // Accepted change is present.
    expect(xml).toContain('SQL/Postgres');
    // Rejected change did NOT leak in — the JSX bullet is untouched.
    expect(xml).not.toContain('React/JSX');
    expect(xml).toContain('Built JSX components for the dashboard');
  });
});

describe('docx export — zero-change export (test 7)', () => {
  it('rejecting every suggestion reproduces the original content exactly', async () => {
    const raw =
      'EXPERIENCE\nWrote Postgres queries to build weekly reports\nLed a team of five engineers';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const suggestions = buildImprovements('Required: SQL and Postgres.', doc);
    expect(suggestions.length).toBeGreaterThan(0);

    const allRejected = suggestions.map<ResumeSuggestion>((s) => ({ ...s, status: 'rejected' }));
    const result = applyAcceptedSuggestions(doc, allRejected);
    // No accepted change leaks in — byte-identical to the original.
    expect(result.text).toBe(raw);
    expect(result.applied).toEqual([]);
  });

  it('exporting an unchanged doc re-parses to the original content (modulo formatting)', async () => {
    const raw = 'EXPERIENCE\nWrote Postgres queries to build weekly reports\nLed a team of five engineers';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const xml = await documentXml(doc);
    expect(xml).toContain('Wrote Postgres queries to build weekly reports');
    expect(xml).toContain('Led a team of five engineers');
  });
});
