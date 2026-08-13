/**
 * CLERICAL RAID SUBSTRATE
 *
 * Automatically generated via memory cell infusion.
 * DO NOT EDIT MANUALLY.
 */

export const INFUSED_ANTIGENS = [
  {
    "source": "memory/MEMORY.md",
    "title": "Fixed Math.random() in `opponent.engine.js` (Law 6).",
    "description": "Fixed Math.random() in `opponent.engine.js` (Law 6).\nThis module was using unseeded randomness in combat logic, violating the determinism mandate.\nFixed by passing the ritual seed.",
    "addedAt": 1778415693557
  },
  {
    "source": "memory/MEMORY.md",
    "title": "Fixed requestId generation in `wordLookupPipeline.js`.",
    "description": "Fixed requestId generation in `wordLookupPipeline.js`.\nDuplicate IDs were causing race conditions in the pipeline.\nFixed by switching to deterministic GUID-8 format.",
    "addedAt": 1778415693557
  },
  {
    "source": "memory/MEMORY.md",
    "title": "Fixed captcha non-determinism in `captcha.service.js`.",
    "description": "Fixed captcha non-determinism in `captcha.service.js`.\nCaptcha generation was using unseeded entropy, making stasis verification impossible.\nFixed by tying to the session seed.\n\n- Ratified PDR-2026-05-09-CELL-WALL-INFRASTRUCTURE.",
    "addedAt": 1778415693557
  },
  {
    "source": "memory/project-cleri-probe-v2.md",
    "title": "A swallowed catch that returns a degraded-but-valid value blinds every caller",
    "description": "A swallowed catch that returns a degraded-but-valid value blinds every caller\nThe dangerous shape is not the swallow, it is the swallow PLUS a plausible return.\nA catch that discards the error and then hands back an empty array, a null, or a\nfalse availability flag leaves callers unable to tell failure from a legitimately\nempty result, so an entire subsystem runs on a fallback while every check stays green.\n\nMeasured 2026-08-12. cmu.phoneme.engine.js init() returns false without reading the\ndictionary whenever `typeof window !== \"undefined\"`, which is always true under the\njsdom test environment. g2p.adapter.js loadCmuEntries wraps that in `catch {}` and\nreturns []. Consequence: the compound and substring generators produced nothing,\nrule-based letter guesses won by default, and the whole phonology suite passed green\nagainst a dictionary-free fallback for roughly three months. Production was unaffected\nonly because that path runs server-side under node.\n\nTriage rule: a swallow that merely SKIPS is usually fine; a swallow that RETURNS\nsomething the caller consumes as truth is the class that hides for months. Of 330\nverified findings carrying spans, 58 were this shape.\n\nRepair, per cleri-probe remediation: rethrow, translate into a BytecodeError, or\nreturn a documented fallback that NAMES the error so the degraded state is visible.",
    "addedAt": 1786579394091
  }
];
