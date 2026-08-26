/**
 * Export SCD64_GLOSSARY to JSON so non-TS callers can resolve codes.
 *
 * The glossary is the authority and stays in TypeScript; this is a derived
 * index, the same relationship .atlas/code-atlas.json has to the repo. It is
 * rebuilt, never hand-edited, and carries the source digest so a consumer can
 * tell it apart from a stale copy.
 *
 * Family codes are assembled here rather than at read time: an SCD64 is its
 * eight slot hexes in slot order, and that ordering is a property of the
 * glossary, not of whoever queries it.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const OUT = resolve(process.cwd(), '.atlas/scd64-glossary.json');
const SRC = resolve(process.cwd(), 'src/core/scd64/glossary.ts');

const { SCD64_GLOSSARY } = await import('../src/core/scd64/glossary.ts');
const { SCD64_SLOT_NAMES } = await import('../src/core/scd64/constants.ts');

const byFamily = new Map();
for (const e of SCD64_GLOSSARY) {
  if (!byFamily.has(e.family)) byFamily.set(e.family, []);
  byFamily.get(e.family).push(e);
}

const families = {};
for (const [family, entries] of byFamily) {
  // Slot order is the wire contract; sorting by slotName would silently
  // reorder the code and produce an identifier that decodes to nothing.
  const ordered = SCD64_SLOT_NAMES
    .map((slot) => entries.find((e) => e.slotName === slot))
    .filter(Boolean);
  const code = ordered.map((e) => e.hexCode).join('');
  families[family] = {
    family,
    code: code.length === 64 ? code : null,
    incomplete: code.length !== 64,
    slots: ordered.map((e) => ({
      slotName: e.slotName,
      hexCode: e.hexCode,
      canonicalMeaning: e.canonicalMeaning,
      humanMeaning: e.humanMeaning,
    })),
  };
}

const slots = {};
for (const e of SCD64_GLOSSARY) {
  // A hex collision across families would make a slot ambiguous; record every
  // owner rather than letting last-write-wins hide it.
  (slots[e.hexCode] ??= []).push({
    family: e.family,
    slotName: e.slotName,
    canonicalMeaning: e.canonicalMeaning,
    humanMeaning: e.humanMeaning,
  });
}

const sourceDigest = createHash('sha256')
  .update(readFileSync(SRC, 'utf8'))
  .digest('hex')
  .slice(0, 16);

const payload = {
  schema: 'SCD64-GLOSSARY-INDEX-v1',
  sourceDigest,
  entries: SCD64_GLOSSARY.length,
  families,
  slots,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
const ambiguous = Object.values(slots).filter((v) => v.length > 1).length;
console.log(
  `wrote ${OUT}\n  families=${Object.keys(families).length} ` +
  `slots=${Object.keys(slots).length} entries=${SCD64_GLOSSARY.length} ` +
  `ambiguousSlots=${ambiguous} sourceDigest=${sourceDigest}`
);
