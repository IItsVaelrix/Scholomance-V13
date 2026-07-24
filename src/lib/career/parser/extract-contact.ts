import { ResumeContact } from './types';

const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.\w+/i;
const PHONE_REGEX = /(?:\+?\d{1,3}[ -.]?)?\(?\d{3}\)?[ -.]?\d{3}[ -.]?\d{4}/g;
const LINKS_REGEX = /https?:\/\/[^\s,]+/gi;

const MAJOR_SECTION_HEADERS = [
  'WORK EXPERIENCE',
  'EXPERIENCE',
  'EMPLOYMENT',
  'CAREER HISTORY',
  'WORK HISTORY',
  'EDUCATION',
  'ACADEMIC BACKGROUND',
  'DEGREES',
  'SKILLS',
  'TECHNICAL SKILLS',
  'CORE COMPETENCIES',
  'TECHNOLOGIES',
  'PROJECTS',
  'PERSONAL PROJECTS',
  'KEY PROJECTS',
  'SUMMARY',
  'PROFESSIONAL SUMMARY',
  'OBJECTIVE',
  'PROFILE',
  'CERTIFICATIONS',
  'LICENSES',
  'AWARDS',
  'HONORS',
  'ACHIEVEMENTS',
  'CONTACT',
  'CONTACT INFORMATION',
  'CONTACT INFO',
];

export function extractContactFields(rawText: string): ResumeContact {
  if (!rawText) {
    return { links: [] };
  }

  const emailMatch = rawText.match(EMAIL_REGEX);
  const email = emailMatch ? emailMatch[0] : undefined;

  const phoneMatch = rawText.match(PHONE_REGEX);
  const phone = phoneMatch ? phoneMatch[0] : undefined;

  const linksMatch = rawText.match(LINKS_REGEX);
  const links = linksMatch ? Array.from(new Set(linksMatch)) : [];

  const lines = rawText.split(/\r?\n/);

  let headerLineIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().replace(/:$/, '').toUpperCase();
    if (MAJOR_SECTION_HEADERS.includes(trimmed)) {
      headerLineIndex = i;
      break;
    }
  }

  const preHeaderLines = lines.slice(0, headerLineIndex);
  let name: string | undefined = undefined;

  for (const line of preHeaderLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (EMAIL_REGEX.test(trimmed)) continue;
    if (PHONE_REGEX.test(trimmed)) continue;
    if (LINKS_REGEX.test(trimmed)) continue;

    if (
      /[\w.-]+@[\w.-]+\.\w+/i.test(trimmed) ||
      /https?:\/\/[^\s,]+/i.test(trimmed)
    ) {
      continue;
    }

    const cleanName = trimmed
      .replace(/^[|\s•\-\u2022]+|[|\s•\-\u2022]+$/g, '')
      .trim();

    if (
      cleanName &&
      cleanName.length > 1 &&
      !/^(resume|curriculum vitae|cv)$/i.test(cleanName)
    ) {
      name = cleanName;
      break;
    }
  }

  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    links,
  };
}
