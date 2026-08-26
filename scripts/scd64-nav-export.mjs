/**
 * Export the NAV family -> hex map so Python can tag episodes with it.
 *
 * The glossary is the authority and stays in TypeScript; this is a narrower
 * derived index than scd64-glossary-export.mjs — it carries only what
 * `nav_classifier.py` needs at runtime: one hex code per NAV family (the
 * BUGCLASS/slotIndex-0 entry, which is the only slot that carries the
 * family's version byte). It is rebuilt, never hand-edited.
 *
 * Written into the Python services directory (not .atlas/) because it is a
 * runtime dependency of divtube_downloader/tui/services code, not a
 * diagnostic artifact.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'divtube_downloader/tui/services/nav_hex.json');

const { SCD64_GLOSSARY } = await import('../src/core/scd64/glossary.ts');

const live = {};
for (const e of SCD64_GLOSSARY) {
  if (e.domain === 'NAV' && e.slotIndex === 0) live[e.family] = e.hexCode;
}

writeFileSync(OUT, JSON.stringify(live, null, 2) + '\n');
console.log(`wrote ${OUT}\n  families=${Object.keys(live).length}`);
