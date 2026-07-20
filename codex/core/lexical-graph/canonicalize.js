// codex/core/lexical-graph/canonicalize.js
export function canonicalizeLower(value) {
  let s = String(value ?? '').normalize('NFC');
  s = s.replace(/^[\s\u200B-\u200D\uFEFF]+|[\s\u200B-\u200D\uFEFF]+$/g, '');
  s = s.toLocaleLowerCase('en-US');
  s = s.replace(/\s+/g, ' ');
  return s;
}

export function wordLexicalId(entryId) {
  const n = Number(entryId);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`PB-ERR-v1-VALUE: invalid entry_id for wordLexicalId: ${entryId}`);
  }
  return `le:word:${n}`;
}

export function deviceLexicalId(slug) {
  const normalized = canonicalizeLower(slug).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!normalized) throw new Error('PB-ERR-v1-VALUE: empty device slug');
  return `le:device:${normalized}`;
}
