#!/usr/bin/env node
/**
 * MEMORY CELL INFUSION CLI
 *
 * Ritual to extract "scars" from private memory and infuse them into the public substrate.
 * Usage: node scripts/memory-cell-infusion.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { extractMemoryAntigens, validatePrivacy } from '../codex/core/immunity/memory-infusion.engine.js';

/**
 * The memory directory was hardcoded to /home/deck/.gemini/tmp/scholomance-v12/memory,
 * which no longer exists — so every run extracted zero antigens, printed
 * "stasis holds", and exited. The infusion has been inert for as long as that
 * path has been dead, while the substrate it feeds still carries three antigens
 * from the era when it worked.
 *
 * An agent's memory location is not a property of this repository, so it is an
 * argument now, not a literal. Order: --memory-dir, then SCHOLOMANCE_MEMORY_DIR,
 * then the current agent's default.
 */
const DEFAULT_MEMORY_DIR = '/home/deck/.claude/projects/-home-deck-Downloads-Scholomance-V12-main/memory';
const flagIndex = process.argv.indexOf('--memory-dir');
const MEMORY_DIR = (flagIndex !== -1 && process.argv[flagIndex + 1])
  || process.env.SCHOLOMANCE_MEMORY_DIR
  || DEFAULT_MEMORY_DIR;
const SUBSTRATE_PATH = 'codex/core/immunity/clerical-raid.substrate.js';

async function main() {
  console.log('[infusion] beginning memory cell extraction...');
  
  const antigens = extractMemoryAntigens(MEMORY_DIR);
  
  if (antigens.length === 0) {
    console.log('[infusion] zero antigens found with # INFUSION_ALLOW tag. stasis holds.');
    return;
  }

  const validAntigens = antigens.filter(a => {
    const ok = validatePrivacy(a);
    if (!ok) console.warn(`[infusion] skipping ${a.title}: privacy violation detected.`);
    return ok;
  });

  console.log(`[infusion] extracted ${validAntigens.length} valid antigens.`);

  // ── Anti-clobber guard ──────────────────────────────────────────────────────
  // This is a full REGENERATE, not an append. The substrate currently holds
  // antigens whose source memory files no longer exist, so a run that extracts
  // a different set would delete them with no warning and no diff to read —
  // immune amnesia performed by the immune system itself.
  //
  // An antigen may only leave the substrate because a human removed its scar,
  // never because a memory directory moved.
  let retained = [];
  try {
    const existing = await import(path.resolve(SUBSTRATE_PATH) + `?t=${Date.now()}`);
    retained = existing.INFUSED_ANTIGENS ?? [];
  } catch {
    // No readable substrate yet — first infusion. Nothing to protect.
    retained = [];
  }

  const incomingTitles = new Set(validAntigens.map((a) => a.title));
  const orphaned = retained.filter((a) => !incomingTitles.has(a.title));

  if (orphaned.length > 0) {
    console.warn(`[infusion] ${orphaned.length} antigen(s) in the substrate have no scar in ${MEMORY_DIR}:`);
    for (const a of orphaned) console.warn(`             - ${a.title}  (from ${a.source})`);
    console.warn('[infusion] RETAINING them. They are carried forward, not regenerated.');
    console.warn('[infusion] To retire one, delete its INFUSION_ALLOW block and pass --allow-forget.');
    if (process.argv.includes('--allow-forget')) {
      console.warn('[infusion] --allow-forget given: dropping them.');
      retained = [];
    }
  }

  const merged = [...retained.filter((a) => !incomingTitles.has(a.title)), ...validAntigens];

  const substrate = `/**
 * CLERICAL RAID SUBSTRATE
 *
 * Automatically generated via memory cell infusion.
 * DO NOT EDIT MANUALLY.
 */

export const INFUSED_ANTIGENS = ${JSON.stringify(merged, null, 2)};
`;

  fs.writeFileSync(SUBSTRATE_PATH, substrate);
  console.log(`[infusion] substrate updated: ${SUBSTRATE_PATH}`);
  console.log(`[infusion] ritual complete. ${merged.length} antigen(s): ${retained.length ? `${merged.length - validAntigens.length} carried forward, ` : ''}${validAntigens.length} from memory.`);
}

main().catch(console.error);
