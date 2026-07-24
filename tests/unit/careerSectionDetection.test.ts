import { describe, it, expect } from 'vitest';
import { extractContactFields } from '../../src/lib/career/parser/extract-contact';
import { detectResumeSections } from '../../src/lib/career/parser/detect-sections';
import { validateResumeDocument } from '../../src/lib/career/parser/validate-parse';
import { ResumeSourceMetadata, OffsetMapping, ParseDiagnostic } from '../../src/lib/career/parser/types';

describe('Career Section Detection & Contact Extraction', () => {
  describe('extractContactFields', () => {
    it('extracts email, phone, links, and candidate name correctly', () => {
      const rawText = `Jane Doe
Senior Software Engineer
jane.doe@example.com | (555) 123-4567 | https://linkedin.com/in/janedoe https://github.com/janedoe

SUMMARY
Passionate engineer with 8 years of experience.`;

      const contact = extractContactFields(rawText);

      expect(contact.name).toBe('Jane Doe');
      expect(contact.email).toBe('jane.doe@example.com');
      expect(contact.phone).toBe('(555) 123-4567');
      expect(contact.links).toEqual([
        'https://linkedin.com/in/janedoe',
        'https://github.com/janedoe',
      ]);
    });

    it('handles documents with missing contact fields gracefully', () => {
      const rawText = `WORK EXPERIENCE
Software Developer at Acme Corp.`;

      const contact = extractContactFields(rawText);

      expect(contact.name).toBeUndefined();
      expect(contact.email).toBeUndefined();
      expect(contact.phone).toBeUndefined();
      expect(contact.links).toEqual([]);
    });

    it('excludes lines with emails, phones, or URLs from name extraction', () => {
      const rawText = `https://github.com/johndoe
john.doe@email.com
John Smith
(123) 456-7890

SKILLS
TypeScript, React, Node.js`;

      const contact = extractContactFields(rawText);

      expect(contact.name).toBe('John Smith');
      expect(contact.email).toBe('john.doe@email.com');
      expect(contact.phone).toBe('(123) 456-7890');
      expect(contact.links).toEqual(['https://github.com/johndoe']);
    });
  });

  describe('detectResumeSections', () => {
    it('detects standard section headings and computes spans correctly', () => {
      const rawText = `Alex Mercer
alex@example.com

SUMMARY
Experienced lead engineer.

WORK EXPERIENCE
Senior Engineer at Tech Co.
Built scalable microservices.

EDUCATION
B.S. in Computer Science, University of Technology.

SKILLS
TypeScript, Go, Docker`;

      const mockOffsetMap: OffsetMapping[] = [
        { rawStart: 0, rawEnd: rawText.length, canonicalStart: 0, canonicalEnd: rawText.length }
      ];

      const sections = detectResumeSections(rawText, mockOffsetMap);

      expect(sections.length).toBeGreaterThanOrEqual(4);

      const summarySec = sections.find((s) => s.kind === 'summary');
      expect(summarySec).toBeDefined();
      expect(summarySec?.heading).toBe('SUMMARY');
      expect(summarySec?.text).toContain('Experienced lead engineer.');
      expect(summarySec?.id).toBe(`section:summary:${summarySec?.span.start}:${summarySec?.span.end}`);
      expect(summarySec?.span.coordinateSpace).toBe('raw');

      const expSec = sections.find((s) => s.kind === 'experience');
      expect(expSec).toBeDefined();
      expect(expSec?.heading).toBe('WORK EXPERIENCE');
      expect(expSec?.text).toContain('Senior Engineer at Tech Co.');

      const eduSec = sections.find((s) => s.kind === 'education');
      expect(eduSec).toBeDefined();
      expect(eduSec?.heading).toBe('EDUCATION');

      const skillsSec = sections.find((s) => s.kind === 'skills');
      expect(skillsSec).toBeDefined();
      expect(skillsSec?.heading).toBe('SKILLS');
    });

    it('handles projects, certifications, and awards headings', () => {
      const rawText = `KEY PROJECTS
Project Alpha - Open Source Tool

CERTIFICATIONS
AWS Certified Solutions Architect

AWARDS
Employee of the Year 2024`;

      const mockOffsetMap: OffsetMapping[] = [];
      const sections = detectResumeSections(rawText, mockOffsetMap);

      const projSec = sections.find((s) => s.kind === 'projects');
      expect(projSec).toBeDefined();
      expect(projSec?.heading).toBe('KEY PROJECTS');

      const certSec = sections.find((s) => s.kind === 'certifications');
      expect(certSec).toBeDefined();
      expect(certSec?.heading).toBe('CERTIFICATIONS');

      const awardSec = sections.find((s) => s.kind === 'awards');
      expect(awardSec).toBeDefined();
      expect(awardSec?.heading).toBe('AWARDS');
    });
  });

  describe('validateResumeDocument', () => {
    it('assembles a frozen ResumeDocument with confidence score', () => {
      const source: ResumeSourceMetadata = { type: 'txt', fileName: 'resume.txt' };
      const rawText = `John Doe\njohn@example.com\n\nWORK EXPERIENCE\nDeveloper`;
      const normalizedText = `john doe john@example.com work experience developer`;
      const offsetMap: OffsetMapping[] = [];
      const contact = extractContactFields(rawText);
      const sections = detectResumeSections(rawText, offsetMap);
      const diagnostics: ParseDiagnostic[] = [];

      const doc = validateResumeDocument({
        source,
        rawText,
        normalizedText,
        offsetMap,
        sections,
        contact,
        diagnostics,
      });

      expect(doc.schemaVersion).toBe(1);
      expect(doc.source).toEqual(source);
      expect(doc.rawText).toBe(rawText);
      expect(doc.normalizedText).toBe(normalizedText);
      expect(doc.contact).toEqual(contact);
      expect(doc.sections).toEqual(sections);
      expect(doc.confidence).toBeGreaterThan(0);
      expect(Object.isFrozen(doc)).toBe(true);
    });
  });
});
