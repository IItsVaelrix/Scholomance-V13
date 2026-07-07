import { OBJECTS } from '../../../../codex/core/semantics.registry.js';
import { lookupWeaveIntent } from '../../../../codex/core/weave-intent-octree.js';
import { getScholomanceStatDefinition } from '../../../../codex/core/scholomance-stats.schema.js';
import { SCHOOLS } from '../../../../codex/core/constants/schools.js';

/** @typedef {{ title: string, body: string }} CombatBestiaryGlossaryEntry */

const SYNTAX_SHAPE_GLOSSARY = Object.freeze({
  PROBE: Object.freeze({
    title: 'Probe',
    body: 'Interrogative verse form — questions and WH-clauses that test and expose structural weaknesses.',
  }),
  COMMAND: Object.freeze({
    title: 'Command',
    body: 'Imperative verse form — decisive orders and commanding verbs that force compliance.',
  }),
  LITANY: Object.freeze({
    title: 'Litany',
    body: 'Anaphoric verse form — repeated opening phrases that build sustained rhythmic pressure.',
  }),
  WARD: Object.freeze({
    title: 'Ward',
    body: 'Declarative ward frame — “stands / holds / shall” statements that reinforce enemy defenses.',
  }),
  RITUAL_CHAIN: Object.freeze({
    title: 'Ritual Chain',
    body: 'Sequential ritual form — chained markers (then, until, after…) that grind through armor over time.',
  }),
  FREE_VERSE: Object.freeze({
    title: 'Free Verse',
    body: 'Unclassified verse shape — no dominant syntax tag; neutral against structure-based resistances.',
  }),
});

const IMAGERY_FAMILY_GLOSSARY = Object.freeze({
  LIGHT: 'Radiance, sun, and illumination imagery — presses shadow and glass archetypes.',
  REVELATION: 'Truth-telling, exposure, and confession — names what tries to hide.',
  WITNESS: 'Oaths, testimony, and naming rites — binds the unseen to account.',
  VOID: 'Absence, emptiness, and unmaking — entropy and hollow force.',
  OBSCURITY: 'Concealment, mist, and veils — feeds shade-like obscurity resistances.',
  SILENCE: 'Hush, quiet, and muting — sonic and resonant counter-pressure.',
  CORROSION: 'Acid, rust, and weathering — wears down stone, metal, and matrix plating.',
  FRACTURE: 'Cracks, shattering, and sundering — breaks rigid or resonant bodies.',
  RUST: 'Oxidation and decay of metal — specialized corrosion against golem plating.',
  EROSION: 'Grinding wear and salt weathering — slow structural fatigue.',
  STONE: 'Rock, granite, and weight — elemental force and golem resistance.',
  FORCE: 'Blunt impact and kinetic strikes — feeds armored or matrix defenses.',
  BONE: 'Skeleton, marrow, and ossuary imagery — physical anchoring.',
  RESONANCE: 'Bells, song, and harmonic rings — strengthens sonic and glass bodies.',
  DISSONANCE: 'Discord, wrong notes, and noise — buckles resonant matrices.',
  REFLECTION: 'Mirrors, glass panes, and glare — light bent back as defense.',
  PURIFICATION: 'Cleansing, washing, and distillations — scourges rot and fungus.',
  SALT: 'Brine and saline scouring — antiseptic pressure against decay.',
  DISTILLATION: 'Alembic and condensing rites — refined purifying process language.',
  SUN: 'Dawn, solar, and daybreak fire — burns through rot apostles.',
  DECAY: 'Rot, mold, and spoil — feeds fungal and poison resistances.',
  POISON: 'Toxin and venom imagery — sustains rot-aligned defenses.',
  FUNGUS: 'Spores and mycelial growth — rot apostle symbolic body.',
});

const ARCHETYPE_GLOSSARY = Object.freeze({
  SHADE: 'Shadow entity — weak to light and naming; resists void and silence.',
  GOLEM: 'Stone automaton — weak to corrosion and fracture; resists blunt force.',
  GLASS_SERAPH: 'Resonant glass angel — weak to dissonance; resists probing questions.',
  ROT_APOSTLE: 'Decay preacher — weak to purification; resists passive wards.',
  BRAZIER_SENTINEL: 'Armillary matrix sentinel — weak to dissonance and command; resists litanies.',
});

const COMBAT_STATUS_GLOSSARY = Object.freeze({
  AGGRO: 'Enemy is alert and actively defending its post.',
  DORMANT: 'Enemy is idle until its ward objective is threatened.',
  DEFEATED: 'Enemy integrity collapsed — no longer a combat threat.',
});

const STATIC_GLOSSARY = Object.freeze({
  ...SYNTAX_SHAPE_GLOSSARY,
  ...Object.fromEntries(
    Object.entries(IMAGERY_FAMILY_GLOSSARY).map(([key, body]) => [key, { title: key, body }]),
  ),
  ...Object.fromEntries(
    Object.entries(ARCHETYPE_GLOSSARY).map(([key, body]) => [key, { title: key.replace(/_/g, ' '), body }]),
  ),
  ...Object.fromEntries(
    Object.entries(COMBAT_STATUS_GLOSSARY).map(([key, body]) => [key, { title: key, body }]),
  ),
  SCHOLOMANCE: Object.freeze({
    title: 'Scholomance',
    body: 'Creative-combat stat signature — how this enemy reads your lyrical and sonic pressure.',
  }),
  BEASTIARY: Object.freeze({
    title: 'Beastiary',
    body: 'Combat dossier registry — weaknesses, behavior, and syntactical chess counsel.',
  }),
  PRESS: Object.freeze({
    title: 'Press',
    body: 'Favor these imagery families and verse forms when weaving against this enemy.',
  }),
  AVOID: Object.freeze({
    title: 'Avoid',
    body: 'These families and forms strengthen the enemy or waste your weave.',
  }),
  INT: Object.freeze({
    title: 'Intelligence',
    body: 'Monster tactical cognition — higher INT yields smarter ability picks, ML counters, alert rolls, and flanking.',
  }),
});

const TOKEN_SPLIT_RE = /([A-Za-z][A-Za-z0-9_]*|[^A-Za-z0-9_]+)/g;
const CAPS_TOKEN_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/**
 * @param {string} token
 * @returns {boolean}
 */
export function isCombatBestiaryGlossaryToken(token) {
  return CAPS_TOKEN_RE.test(token) && token.length >= 2;
}

/**
 * @param {string} term
 * @returns {CombatBestiaryGlossaryEntry | null}
 */
export function lookupCombatBestiaryGlossaryTerm(term) {
  const key = String(term || '').trim().toUpperCase();
  if (!key || !isCombatBestiaryGlossaryToken(key)) return null;

  const staticEntry = STATIC_GLOSSARY[key];
  if (staticEntry) return staticEntry;

  const scholomanceStat = getScholomanceStatDefinition(key);
  if (scholomanceStat) {
    return {
      title: scholomanceStat.fullName,
      body: scholomanceStat.coreFunction,
    };
  }

  const school = SCHOOLS[key];
  if (school) {
    return {
      title: school.name,
      body: `Magic school affinity — ${school.name} weave and verse resonance.`,
    };
  }

  const weaveObject = OBJECTS[key];
  if (weaveObject) {
    return {
      title: key,
      body: `Spellweave object (${weaveObject.category.toLowerCase()}) — valid target token in intent-object clauses.`,
    };
  }

  const weaveIntent = lookupWeaveIntent(key);
  if (weaveIntent?.description) {
    return {
      title: key,
      body: weaveIntent.description,
    };
  }

  return null;
}

/**
 * Split display copy into plain text and glossary-eligible tokens.
 *
 * @param {string} text
 * @returns {Array<{ type: 'text' | 'term', value: string, glossary?: CombatBestiaryGlossaryEntry }>}
 */
export function parseCombatBestiaryGlossaryText(text) {
  const source = String(text ?? '');
  if (!source) return [];

  const parts = source.match(TOKEN_SPLIT_RE) || [source];
  return parts.map((part) => {
    if (!isCombatBestiaryGlossaryToken(part)) {
      return { type: 'text', value: part };
    }
    const glossary = lookupCombatBestiaryGlossaryTerm(part);
    if (!glossary) {
      return { type: 'text', value: part };
    }
    return { type: 'term', value: part, glossary };
  });
}