/**
 * Structural fidelity of the exported résumé.
 *
 * Four defects observed on a real export, each traced to one mechanism:
 *   1. a custom section heading ("TECHNICAL & REMOTE READINESS") was swallowed as body text
 *      of the previous section, because `detectResumeSections` only knows an exact-match
 *      whitelist of headings;
 *   2. the adjacent-evidence "… using ␟" draft anchored onto a SKILLS list item, fusing two
 *      separately-listed facts into a relationship the résumé never asserted;
 *   3. the DOCX carried no keep-with-next, so a role title could land alone at the foot of a
 *      page with its date and bullets on the next one;
 *   4. a role title with no date line was emitted as a bullet, because `segmentEntries`
 *      recognised a title only when a date was attached to it.
 */
import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { detectResumeSections } from '../../src/lib/career/parser/detect-sections';
import { segmentEntries } from '../../src/lib/career/parser/segment-entries';
import { segmentDocumentBullets } from '../../src/lib/career/parser/segment-bullets';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { vocabularyInjectionRule } from '../../src/lib/career/improve/rules/vocabulary-injection';
import { buildDocxExport } from '../../src/lib/career/export/docx-export';
import { parseResumeSource } from '../../src/lib/career/parser/parse-resume';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

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

async function documentXml(doc: ResumeDocument): Promise<string> {
  const { blob } = await buildDocxExport(doc, {});
  const unzipped = unzipSync(await blobToBytes(blob));
  return new TextDecoder('utf-8').decode(unzipped['word/document.xml']);
}

const RESUME = `Angel Hernandez
itsvaelrix@gmail.com

EXPERIENCE
Founder & Systems Architect - Vaelrix
Built and shipped a full-stack knowledge platform
Designed the data pipeline end to end

Customer Service Representative - GC Services
2021 - Present
Responsible for handling inbound customer calls
Trained new hires on company systems

TECHNICAL & REMOTE READINESS
PII awareness
Wired internet
VoIP and AVAYA
Zoom

EDUCATION
High School Diploma, Springfield High School`;

describe('§1 custom section headings own their content', () => {
  const sections = detectResumeSections(RESUME, []);

  it('detects a heading that is not in the known-heading whitelist', () => {
    const headings = sections.map((s) => s.heading).filter(Boolean);
    expect(headings).toContain('TECHNICAL & REMOTE READINESS');
  });

  it('does not leak the heading text into another section as content', () => {
    const owner = sections.find((s) => s.heading === 'TECHNICAL & REMOTE READINESS');
    expect(owner).toBeTruthy();
    for (const other of sections) {
      if (other === owner) continue;
      expect(other.text).not.toContain('TECHNICAL & REMOTE READINESS');
    }
  });

  it('keeps the readiness items out of EDUCATION and EXPERIENCE', () => {
    const education = sections.find((s) => s.kind === 'education');
    const experience = sections.find((s) => s.kind === 'experience');
    expect(education?.text).not.toContain('PII awareness');
    expect(experience?.text).not.toContain('PII awareness');
  });

  it('does not mistake an all-caps role/company line for a section heading', () => {
    const capsRoles = `EXPERIENCE
SENIOR ANALYST - ACME CORP
2019 - 2021
Built the quarterly reporting pack

EDUCATION
B.S. Economics`;
    const headings = detectResumeSections(capsRoles, []).map((s) => s.heading);
    expect(headings).not.toContain('SENIOR ANALYST - ACME CORP');
  });

  it('does not mistake an all-caps candidate name for a section heading', () => {
    const capsName = `ANGEL HERNANDEZ
itsvaelrix@gmail.com

EXPERIENCE
Built the quarterly reporting pack`;
    const headings = detectResumeSections(capsName, []).map((s) => s.heading);
    expect(headings).not.toContain('ANGEL HERNANDEZ');
  });
});

describe('§4 a role title without a date is still a title', () => {
  it('promotes a dateless "Role - Company" line to an entry title, not a bullet', () => {
    const sections = detectResumeSections(RESUME, []);
    const experience = sections.find((s) => s.kind === 'experience')!;
    const entries = segmentEntries(experience);

    const titles = entries.map((e) => e.title?.rawText).filter(Boolean);
    expect(titles).toContain('Founder & Systems Architect - Vaelrix');

    const allBullets = entries.flatMap((e) => e.bullets.map((b) => b.rawText));
    expect(allBullets).not.toContain('Founder & Systems Architect - Vaelrix');
  });

  it('keeps the dateless role\'s achievements under it, not under the next employer', () => {
    const sections = detectResumeSections(RESUME, []);
    const experience = sections.find((s) => s.kind === 'experience')!;
    const entries = segmentEntries(experience);
    const vaelrix = entries.find((e) => e.title?.rawText.includes('Vaelrix'))!;
    expect(vaelrix.bullets.map((b) => b.rawText)).toEqual([
      'Built and shipped a full-stack knowledge platform',
      'Designed the data pipeline end to end',
    ]);
  });

  it('does not promote a verb-led achievement that happens to contain a dash', () => {
    const section = {
      id: 'section:experience:0:1',
      kind: 'experience' as const,
      heading: 'EXPERIENCE',
      text: `EXPERIENCE
Trained new hires - including the 2021 cohort
Resolved escalations at scale`,
      span: { coordinateSpace: 'raw' as const, start: 0, end: 200 },
      confidence: 0.9,
      evidence: [],
    };
    const entries = segmentEntries(section);
    const titles = entries.map((e) => e.title?.rawText).filter(Boolean);
    expect(titles).toHaveLength(0);
  });

  it('does not promote skills-list items in a non-experience section', () => {
    const sections = detectResumeSections(RESUME, []);
    const readiness = sections.find((s) => s.heading === 'TECHNICAL & REMOTE READINESS');
    if (!readiness) return; // covered by §1
    const entries = segmentEntries(readiness);
    expect(entries.map((e) => e.title?.rawText).filter(Boolean)).toHaveLength(0);
  });
});

describe('§2 the "… using ␟" draft only attaches to accomplishment bullets', () => {
  const jd = `Inside Sales Representative.
Required: consultative selling, video conferencing, data security, CRM.
Preferred: Salesforce.`;

  const skillsResume = `Angel Hernandez

EXPERIENCE
Customer Service Representative - GC Services
2021 - Present
Responsible for handling inbound customer calls

CORE COMPETENCIES
Consultative Needs Assessment
Secure Handling of Customer Data
VoIP
Zoom
CRM systems`;

  function draftsFor(raw: string) {
    const sections = detectResumeSections(raw, []);
    const bullets = segmentDocumentBullets(sections);
    const doc = { rawText: raw, sections, contact: { links: [] } } as unknown as ResumeDocument;
    const map = mapEvidence(buildRequirementLedger(jd), bullets);
    return { sections, suggestions: vocabularyInjectionRule(map, bullets, doc) };
  }

  it('never fuses two separately-listed skills into "A using B"', () => {
    const { suggestions } = draftsFor(skillsResume);
    const afters = suggestions.map((s) => s.after).filter(Boolean) as string[];
    expect(afters).not.toContain('Consultative Needs Assessment using ␟');
    expect(afters).not.toContain('Secure Handling of Customer Data using ␟');
  });

  it('drafts no fill-in rewrite anchored outside experience/projects', () => {
    const { sections, suggestions } = draftsFor(skillsResume);
    const kindById = new Map(sections.map((s) => [s.id, s.kind]));
    for (const sug of suggestions) {
      if (!sug.requiresInput) continue;
      const kind = kindById.get(sug.target?.sectionId ?? '');
      expect(['experience', 'projects']).toContain(kind);
    }
  });

  it('still drafts the fill-in on a real experience bullet', () => {
    const raw = `Angel Hernandez

EXPERIENCE
Customer Service Representative - GC Services
2021 - Present
Handled consultative conversations with inbound customers`;
    const { suggestions } = draftsFor(raw);
    const drafted = suggestions.filter((s) => s.requiresInput && (s.after || '').includes('using'));
    expect(drafted.length).toBeGreaterThan(0);
  });

  it('records the résumé anchor span as evidence, not only the JD clause', () => {
    const raw = `Angel Hernandez

EXPERIENCE
Customer Service Representative - GC Services
2021 - Present
Handled consultative conversations with inbound customers`;
    const { suggestions } = draftsFor(raw);
    const drafted = suggestions.find((s) => s.requiresInput && (s.after || '').includes('using'));
    expect(drafted).toBeTruthy();
    const resumeEvidence = drafted!.evidence.filter((e) => e.source === 'resume');
    expect(resumeEvidence.length).toBeGreaterThan(0);
    expect(resumeEvidence[0].span).toBeTruthy();
  });
});

describe('§5 every entry title is a typed role heading', () => {
  function experienceEntries(raw: string) {
    const section = detectResumeSections(raw, []).find((s) => s.kind === 'experience')!;
    return segmentEntries(section);
  }

  const shapes: Record<string, string> = {
    'slash separator, no date': `EXPERIENCE
Social Media Manager / Sales
Grew the brand account to 40k followers
Closed inbound leads from DMs`,
    'no separator, no date': `EXPERIENCE
Social Media Manager
Grew the brand account to 40k followers`,
    'dash separator, no date': `EXPERIENCE
Founder & Systems Architect - Vaelrix
Built the data pipeline end to end`,
    'title then date': `EXPERIENCE
Customer Service Representative - GC Services
2021 - Present
Handled inbound customer calls`,
    'inline date': `EXPERIENCE
Social Media Manager / Sales | 2022 - 2024
Grew the brand account to 40k followers`,
  };

  for (const [name, raw] of Object.entries(shapes)) {
    it(`classifies the role heading as a title, not a bullet — ${name}`, () => {
      const entries = experienceEntries(raw);
      const first = entries[0];
      expect(first.title?.rawText).toMatch(/Social Media Manager|Founder|Customer Service/);
      const allBullets = entries.flatMap((e) => e.bullets.map((b) => b.rawText));
      expect(allBullets).not.toContain(first.title!.rawText);
    });

    it(`tags it role_heading — ${name}`, () => {
      for (const entry of experienceEntries(raw)) {
        if (!entry.title) continue;
        expect(entry.title.kind).toBe('role_heading');
      }
    });
  }

  it('keeps a role written across role / company / date lines as ONE entry', () => {
    const entries = experienceEntries(`EXPERIENCE
Social Media Manager / Sales
Vaelrix
2022 - 2024
Grew the brand account to 40k followers`);
    expect(entries).toHaveLength(1);
    expect(entries[0].title?.rawText).toBe('Social Media Manager / Sales — Vaelrix');
    expect(entries[0].date?.rawText).toBe('2022 - 2024');
    expect(entries[0].bullets.map((b) => b.rawText)).toEqual([
      'Grew the brand account to 40k followers',
    ]);
  });

  it('parses a full date range instead of truncating at the dash', () => {
    const entries = experienceEntries(`EXPERIENCE
Social Media Manager / Sales | 2022 - 2024
Grew the brand account to 40k followers`);
    expect(entries[0].date?.rawText).toBe('2022 - 2024');
  });

  // The section-opening rule is positional, so these are the cases that constrain it: an
  // achievement is a CLAUSE, and an entry needs something underneath it.
  it('does not promote an opening line that is a clause, whatever its verb', () => {
    for (const line of [
      'Queried the database for ad-hoc analysis',
      'Partnered with analysts to model warehouse tables for reporting',
      'Fielded escalations from enterprise accounts',
    ]) {
      const entries = experienceEntries(`EXPERIENCE\n${line}\nHandled inbound customer calls`);
      expect(entries.flatMap((e) => e.bullets.map((b) => b.rawText))).toContain(line);
      expect(entries[0].title).toBeUndefined();
    }
  });

  it('does not promote the only line of a one-line experience section', () => {
    const entries = experienceEntries('EXPERIENCE\nAccount Management');
    expect(entries[0].title).toBeUndefined();
    expect(entries[0].bullets.map((b) => b.rawText)).toEqual(['Account Management']);
  });

  it('still allows an ordinary title containing "of" or "and"', () => {
    for (const title of ['Director of Engineering', 'Sales and Marketing Manager']) {
      const entries = experienceEntries(`EXPERIENCE\n${title}\nGrew the pipeline 40%`);
      expect(entries[0].title?.rawText).toBe(title);
    }
  });

  it('renders every role heading in bold title position, never as a bullet', async () => {
    const doc = await parseResumeSource({
      type: 'paste',
      content: `EXPERIENCE
Social Media Manager / Sales
Grew the brand account to 40k followers

Customer Service Representative - GC Services
2021 - Present
Handled inbound customer calls`,
    });
    const xml = await documentXml(doc);
    const titleParagraph = /<w:p>(?:(?!<\/w:p>).)*Social Media Manager \/ Sales(?:(?!<\/w:p>).)*<\/w:p>/.exec(xml);
    expect(titleParagraph).toBeTruthy();
    expect(titleParagraph![0]).toContain('<w:b/>'); // bold
    expect(titleParagraph![0]).not.toContain('<w:numPr>'); // not a list item
  });
});

describe('§3 a role entry is not split across a page break', () => {
  it('marks title, date, and the first bullet to stay together', async () => {
    const doc = await parseResumeSource({ type: 'paste', content: RESUME });
    const xml = await documentXml(doc);
    // Word cohesion primitives — absent entirely before this fix.
    expect(xml).toContain('<w:keepNext');
    expect(xml).toContain('<w:keepLines');
  });

  it('keeps every section heading with the content it introduces', async () => {
    const doc = await parseResumeSource({ type: 'paste', content: RESUME });
    const xml = await documentXml(doc);
    const headingParagraphs = xml.match(/<w:p>(?:(?!<\/w:p>).)*Heading1(?:(?!<\/w:p>).)*<\/w:p>/g) || [];
    expect(headingParagraphs.length).toBeGreaterThan(0);
    for (const p of headingParagraphs) expect(p).toContain('<w:keepNext');
  });
});
