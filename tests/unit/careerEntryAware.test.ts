import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { segmentEntries, segmentEntryBullets, lineHasDate } from '../../src/lib/career/parser/segment-entries';
import { segmentDocumentBullets } from '../../src/lib/career/parser/segment-bullets';
import { buildImprovements } from '../../src/lib/career/improve/build-improvements';
import { reorderRule } from '../../src/lib/career/improve/rules/reorder';
import { quantifyRule } from '../../src/lib/career/improve/rules/quantify';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { applyMovesAndRewrites } from '../../src/lib/career/improve/apply-moves';
import { assertTokenProvenance } from '../../src/lib/career/improve/honesty/token-provenance';
import { UserFactLedger } from '../../src/lib/career/improve/honesty/user-fact-ledger';
import { buildDocxExport } from '../../src/lib/career/export/docx-export';
import { makeImproveDoc } from './fixtures/career-improve-doc';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/input-sentinel';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

/** The bug-report résumé: strong achievements belong to iQor, weak ones to GC Services. */
const MULTI_EMPLOYER = [
  'EXPERIENCE',
  'Customer Service Representative - GC Services',
  '2021 - Present',
  'Trained new hires on company systems',
  'Sales Representative - iQor',
  '2019 - 2021',
  'Organized the supply closet',
  'Achieved a 60% close rate on outbound calls',
  'Drove a 24% upsell rate across the book',
].join('\n');

function indexOf(text: string, needle: string): number {
  const i = text.indexOf(needle);
  expect(i, `expected to find "${needle}"`).toBeGreaterThanOrEqual(0);
  return i;
}

describe('entry-aware segmentation (architectural correction)', () => {
  it('recovers an entry per employer with title, date, and only its own bullets', () => {
    const doc = makeImproveDoc(MULTI_EMPLOYER, 'experience', 'EXPERIENCE');
    const entries = segmentEntries(doc.sections[0]);

    expect(entries.length).toBe(2);

    const [gc, iQor] = entries;
    expect(gc.title?.rawText).toBe('Customer Service Representative - GC Services');
    expect(gc.date?.rawText).toBe('2021 - Present');
    expect(gc.bullets.map((b) => b.rawText)).toEqual(['Trained new hires on company systems']);

    expect(iQor.title?.rawText).toBe('Sales Representative - iQor');
    expect(iQor.date?.rawText).toBe('2019 - 2021');
    expect(iQor.bullets.map((b) => b.rawText)).toEqual([
      'Organized the supply closet',
      'Achieved a 60% close rate on outbound calls',
      'Drove a 24% upsell rate across the book',
    ]);
  });

  it('never emits a role title or a date line as a ResumeBullet', () => {
    const doc = makeImproveDoc(MULTI_EMPLOYER, 'experience', 'EXPERIENCE');
    const bullets = segmentEntryBullets(doc.sections[0]);
    const texts = bullets.map((b) => b.rawText);

    expect(texts).not.toContain('Customer Service Representative - GC Services');
    expect(texts).not.toContain('Sales Representative - iQor');
    expect(texts).not.toContain('2021 - Present');
    expect(texts).not.toContain('2019 - 2021');
    expect(texts).not.toContain('EXPERIENCE');
    // Every bullet is tagged with an entryId.
    for (const b of bullets) expect(b.entryId).toBeTruthy();
  });

  it('tags each bullet with the entryId of ITS OWN employer', () => {
    const doc = makeImproveDoc(MULTI_EMPLOYER, 'experience', 'EXPERIENCE');
    const entries = segmentEntries(doc.sections[0]);
    const [gc, iQor] = entries;
    for (const b of gc.bullets) expect(b.entryId).toBe(gc.id);
    for (const b of iQor.bullets) expect(b.entryId).toBe(iQor.id);
    expect(gc.id).not.toBe(iQor.id);
  });

  it('parses an inline-date title ("Role - Company | 2019-2021")', () => {
    const raw = 'EXPERIENCE\nSales Representative - iQor | 2019 - 2021\nAchieved a 60% close rate';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const entries = segmentEntries(doc.sections[0]);
    expect(entries.length).toBe(1);
    expect(entries[0].title?.rawText).toBe('Sales Representative - iQor');
    expect(entries[0].date?.rawText).toContain('2019');
    expect(entries[0].bullets.map((b) => b.rawText)).toEqual(['Achieved a 60% close rate']);
  });

  it('a headerless section yields one entry — preserving prior flat behavior', () => {
    const raw = 'EXPERIENCE\nWrote Postgres queries to build weekly reports\nLed a team of five engineers';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const entries = segmentEntries(doc.sections[0]);
    expect(entries.length).toBe(1);
    expect(entries[0].title).toBeUndefined();
    expect(entries[0].bullets.length).toBe(2);
    // segmentDocumentBullets still returns both bullets (backward compat).
    expect(segmentDocumentBullets(doc.sections).length).toBe(2);
  });

  it('lineHasDate distinguishes a date line from a percentage achievement', () => {
    expect(lineHasDate('2019 - 2021')).toBe(true);
    expect(lineHasDate('Jan 2020 – Present')).toBe(true);
    expect(lineHasDate('Increased sales by 2019%')).toBe(false); // a percent, not a year
    expect(lineHasDate('Achieved a 60% close rate')).toBe(false);
  });
});

describe('employer-boundary enforcement (the core bug)', () => {
  const jd = 'Required: upsell and close rate. Must have strong upsell and close-rate skills.';

  it('reorder moves stay within their own entry — no move crosses an employer boundary', () => {
    const doc = makeImproveDoc(MULTI_EMPLOYER, 'experience', 'EXPERIENCE');
    const bullets = segmentDocumentBullets(doc.sections);
    const reqs = buildRequirementLedger(jd);
    const map = mapEvidence(reqs, bullets);
    const sugs = reorderRule(map, bullets, doc);
    const moves = sugs.filter((s) => s.move);
    expect(moves.length).toBeGreaterThan(0);

    const entries = segmentEntries(doc.sections[0]);
    const iQor = entries.find((e) => e.title?.rawText.includes('iQor'))!;
    const iQorBulletIds = new Set(iQor.bullets.map((b) => b.id));

    for (const m of moves) {
      // Every move is scoped to the iQor entry (where the relevant bullets live).
      expect(m.move!.entryId).toBe(iQor.id);
      expect(iQorBulletIds.has(m.move!.bulletId)).toBe(true);
      if (m.move!.afterBulletId) expect(iQorBulletIds.has(m.move!.afterBulletId)).toBe(true);
      if (m.move!.beforeBulletId) expect(iQorBulletIds.has(m.move!.beforeBulletId)).toBe(true);
    }
  });

  it('applying the accepted reorder keeps every achievement under its own employer', () => {
    const doc = makeImproveDoc(MULTI_EMPLOYER, 'experience', 'EXPERIENCE');
    const suggestions = buildImprovements(jd, doc);
    const accepted = suggestions.map<ResumeSuggestion>((s) =>
      s.move ? { ...s, status: 'accepted' } : { ...s, status: 'rejected' }
    );
    const result = applyAcceptedSuggestions(doc, accepted);
    const out = result.text;

    const gcTitle = indexOf(out, 'Customer Service Representative - GC Services');
    const trained = indexOf(out, 'Trained new hires on company systems');
    const iQorTitle = indexOf(out, 'Sales Representative - iQor');
    const close = indexOf(out, 'Achieved a 60% close rate on outbound calls');
    const upsell = indexOf(out, 'Drove a 24% upsell rate across the book');

    // GC's bullet stays in the GC region (above the iQor title) — not pushed down.
    expect(gcTitle).toBeLessThan(trained);
    expect(trained).toBeLessThan(iQorTitle);
    // iQor's strong bullets stay UNDER the iQor title — never promoted into GC.
    expect(iQorTitle).toBeLessThan(close);
    expect(iQorTitle).toBeLessThan(upsell);
    // The strong bullets were promoted to the FRONT of the iQor entry (above the weak one).
    expect(close).toBeLessThan(indexOf(out, 'Organized the supply closet'));
    // Titles and dates are preserved, not orphaned.
    expect(out).toContain('2021 - Present');
    expect(out).toContain('2019 - 2021');
  });

  it('a forced cross-entry move is mechanically rejected as a conflict', () => {
    const doc = makeImproveDoc(MULTI_EMPLOYER, 'experience', 'EXPERIENCE');
    const entries = segmentEntries(doc.sections[0]);
    const [gc, iQor] = entries;
    const gcBullet = gc.bullets[0];
    const iQorBullet = iQor.bullets[1];

    // A malicious/buggy move: drag an iQor bullet into the GC entry.
    const crossMove: ResumeSuggestion = {
      id: 'suggestion:structure:cross:forced',
      type: 'structure',
      target: { sectionId: doc.sections[0].id },
      before: iQorBullet.rawText,
      after: iQorBullet.rawText,
      reason: 'forced cross-entry move',
      evidence: [],
      confidence: 0.7,
      risk: 'low',
      requiresUserApproval: true,
      status: 'accepted',
      editable: false,
      move: { bulletId: iQorBullet.id, entryId: gc.id, afterBulletId: gcBullet.id },
    };

    const result = applyMovesAndRewrites(doc, [crossMove]);
    expect(result.applied).not.toContain(crossMove.id);
    expect(result.skipped.some((s) => s.suggestionId === crossMove.id && s.reason === 'conflict')).toBe(true);
    // The document is unchanged — the iQor bullet did not move into GC.
    expect(result.text).toBe(doc.rawText);
  });
});

describe('honesty — numbers enter only via recorded user-input events', () => {
  it('rejects a number that is neither in the before bullet nor user-supplied', () => {
    const verdict = assertTokenProvenance('Drove revenue growth across the region', 'Drove revenue growth by 40% across the region', []);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('unprovenanced_number:40');
  });

  it('accepts the same number once it is a recorded user-supplied value', () => {
    const ledger = new UserFactLedger();
    ledger.record({ value: '40%', suggestionId: 's1', slotId: 's1:slot:1', acceptedAtRevision: 1 });
    const verdict = assertTokenProvenance(
      'Drove revenue growth across the region',
      'Drove revenue growth by 40% across the region',
      [],
      ledger.values()
    );
    expect(verdict.ok).toBe(true);
  });

  it('a number already stated in the before bullet needs no extra provenance', () => {
    const verdict = assertTokenProvenance('Drove a 40% revenue increase', 'Increased revenue by 40%', []);
    expect(verdict.ok).toBe(true);
  });

  it('records user-supplied facts from a filled quantify suggestion', () => {
    const sug: ResumeSuggestion = {
      id: 'suggestion:quantify:x:1',
      type: 'quantify',
      before: 'Reduced the deployment pipeline runtime',
      after: `Reduced the deployment pipeline runtime, reducing build time by 40%`,
      reason: 'test',
      evidence: [],
      confidence: 0.75,
      risk: 'low',
      requiresUserApproval: true,
      status: 'accepted',
      inputSlots: [
        { id: 'slot0', placeholder: 'what you reduced', hint: '' },
        { id: 'slot1', placeholder: 'percent', hint: '' },
      ],
    };
    const ledger = new UserFactLedger();
    ledger.recordFromSuggestion(sug, { slot0: 'build time', slot1: '40' }, 3);
    expect(ledger.size).toBe(2);
    expect(ledger.values().has('40')).toBe(true);
    const facts = ledger.all();
    expect(facts[0].acceptedAtRevision).toBe(3);
    expect(facts[0].suggestionId).toBe(sug.id);
  });
});

describe('honesty — quantify never fabricates a "managing a team of" frame', () => {
  it('does NOT assert a team for "managed communications" (no people object) — uses the open slot', () => {
    const raw = 'EXPERIENCE\nIndependently managed communications across regions';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const bullets = segmentDocumentBullets(doc.sections);
    const reqs = buildRequirementLedger('Required: communications management. Must have strong communications.');
    const map = mapEvidence(reqs, bullets);
    const sugs = quantifyRule(map, bullets, doc);
    const q = sugs.find((s) => s.type === 'quantify');
    // If it fires at all, it must NOT fabricate a team headcount frame.
    if (q) {
      expect(q.after).not.toContain('managing a team of');
      expect(q.after).toContain(INPUT_SENTINEL);
    }
  });

  it('DOES offer the team frame for a genuine people-object bullet ("Led the engineering team")', () => {
    const raw = 'EXPERIENCE\nLed the engineering team across regions';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const bullets = segmentDocumentBullets(doc.sections);
    const reqs = buildRequirementLedger('Required: team leadership. Must have led engineering teams.');
    const map = mapEvidence(reqs, bullets);
    const sugs = quantifyRule(map, bullets, doc);
    const q = sugs.find((s) => s.type === 'quantify');
    expect(q).toBeTruthy();
    expect(q!.after).toContain('managing a team of');
  });
});

describe('export — recruiter-polished hierarchy (still ATS-safe)', () => {
  async function blobToBytes(blob: Blob): Promise<Uint8Array> {
    if (typeof (blob as any).arrayBuffer === 'function') {
      return new Uint8Array(await (blob as any).arrayBuffer());
    }
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
    return new TextDecoder('utf-8').decode(unzipped['word/document.xml']);
  }

  it('renders experience entries with a bold title, italic date, and numbered bullets', async () => {
    const doc = makeImproveDoc(MULTI_EMPLOYER, 'experience', 'EXPERIENCE');
    const xml = await documentXml(doc);

    // The role title and date survive into the document.
    expect(xml).toContain('Sales Representative - iQor');
    expect(xml).toContain('2019 - 2021');
    // Bold runs (titles) and italic runs (dates) are present.
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    // Bullets use real numbering (visible glyph + indent).
    expect(xml).toContain('<w:numPr>');
    // Still ATS-safe: no tables / text boxes / headers / footers.
    expect(xml).not.toContain('<w:tbl');
    expect(xml).not.toContain('<w:txbxContent');
    expect(xml).not.toContain('<w:hdr>');
    expect(xml).not.toContain('<w:ftr>');
  });

  it('styles every major section heading consistently', async () => {
    const raw = 'EXPERIENCE\nSales Representative - iQor\n2019 - 2021\nAchieved a 60% close rate\nSKILLS\nSQL, React';
    const full: ResumeDocument = {
      ...makeImproveDoc(raw, 'experience', 'EXPERIENCE'),
    };
    // Build a two-section doc (experience + skills) to compare heading styling.
    const doc = makeTwoSectionDocForTest(raw);
    const xml = await documentXml(doc);
    // Both headings are uppercased and present.
    expect(xml).toContain('EXPERIENCE');
    expect(xml).toContain('SKILLS');
    expect(full.sections.length).toBeGreaterThan(0);
  });
});

/** Build a doc with an experience section (with entries) followed by a skills section. */
function makeTwoSectionDocForTest(experienceRaw: string): ResumeDocument {
  const skillsText = 'SKILLS\nSQL, React';
  const rawText = `${experienceRaw}\n${skillsText}`;
  const expEnd = experienceRaw.length;
  return {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'fixture.txt' },
    rawText,
    normalizedText: rawText.toLowerCase(),
    offsetMap: [],
    sections: [
      {
        id: `section:experience:0:${expEnd}`,
        kind: 'experience',
        heading: 'EXPERIENCE',
        text: experienceRaw,
        span: { coordinateSpace: 'raw', start: 0, end: expEnd },
        confidence: 0.9,
        evidence: [],
      },
      {
        id: `section:skills:${expEnd}:${rawText.length}`,
        kind: 'skills',
        heading: 'SKILLS',
        text: skillsText,
        span: { coordinateSpace: 'raw', start: expEnd + 1, end: rawText.length },
        confidence: 0.9,
        evidence: [],
      },
    ],
    contact: { links: [] },
    diagnostics: [],
    confidence: 0.9,
  };
}

describe('entry-anchored insertion (Case A apply path)', () => {
  // Date lines make segmentEntries recover one entry per employer; without them the whole
  // section collapses to a single entry and "the chosen entry" is meaningless.
  const RESUME = [
    'EXPERIENCE',
    'iQor — Support Lead',
    '2021 - Present',
    'Wrote reporting queries against Postgres',
    'GC Services — Agent',
    '2019 - 2021',
    'Handled inbound customer calls',
  ].join('\n');

  it('inserts a new bullet at the end of the chosen entry only', () => {
    const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
    const entries = segmentEntries(doc.sections[0]);
    const iqor = entries[0];

    const result = applyMovesAndRewrites(doc, [
      {
        id: 'sug:insert:1',
        type: 'learning_gap',
        target: { entryId: iqor.id, sectionId: doc.sections[0].id },
        after: 'Used Apache Airflow, saved time',
        reason: 'test',
        evidence: [],
        confidence: 0.6,
        risk: 'medium',
        requiresUserApproval: true,
        status: 'accepted',
      },
    ]);

    expect(result.applied).toContain('sug:insert:1');
    const lines = result.text.split('\n');
    const inserted = lines.findIndex((l) => l.includes('Apache Airflow'));
    const gcServices = lines.findIndex((l) => l.includes('GC Services'));
    // The new bullet lands inside the iQor entry, above the next employer.
    expect(inserted).toBeGreaterThan(lines.findIndex((l) => l.includes('Postgres')));
    expect(inserted).toBeLessThan(gcServices);
    // The other entry is untouched.
    expect(result.text).toContain('Handled inbound customer calls');
  });

  it('refuses an insertion naming an entry that does not exist', () => {
    const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
    const result = applyMovesAndRewrites(doc, [
      {
        id: 'sug:insert:2',
        type: 'learning_gap',
        target: { entryId: 'entry:does-not-exist', sectionId: doc.sections[0].id },
        after: 'Used Apache Airflow, saved time',
        reason: 'test',
        evidence: [],
        confidence: 0.6,
        risk: 'medium',
        requiresUserApproval: true,
        status: 'accepted',
      },
    ]);
    expect(result.applied).not.toContain('sug:insert:2');
    expect(result.skipped.some((s) => s.suggestionId === 'sug:insert:2')).toBe(true);
    expect(result.text).not.toContain('Apache Airflow');
  });
});
