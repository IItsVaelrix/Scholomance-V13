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
    "title": "Silent failure: a swallowed error in a catch block returns a degraded-but-valid value",
    "description": "Silent failure: a swallowed error in a catch block returns a degraded-but-valid value\nTHE TITLE IS THE HYPOTHESIS. cleri-probe's planner matches EXACT PHRASES, so a title\nmust contain one of: 'swallowed error', 'swallow error', 'silent failure',\n'empty catch', 'catch block', 'error is ignored' — or the antigen compiles to zero\npathology classes, the sweep returns INCONCLUSIVE, and the scar is never hunted.\nThe first draft of this antigen said 'swallowed catch' and was silently un-huntable.\n\nThe dangerous shape is not the swallow, it is the swallow PLUS a plausible return.\nA catch that discards the error and then hands back an empty array, a null, or a\nfalse availability flag leaves callers unable to tell failure from a legitimately\nempty result, so an entire subsystem runs on a fallback while every check stays green.\n\nMeasured 2026-08-12. cmu.phoneme.engine.js init() returns false without reading the\ndictionary whenever `typeof window !== \"undefined\"`, which is always true under the\njsdom test environment. g2p.adapter.js loadCmuEntries wraps that in `catch {}` and\nreturns []. Consequence: the compound and substring generators produced nothing,\nrule-based letter guesses won by default, and the whole phonology suite passed green\nagainst a dictionary-free fallback for roughly three months. Production was unaffected\nonly because that path runs server-side under node.\n\nTriage rule: a swallow that merely SKIPS is usually fine; a swallow that RETURNS\nsomething the caller consumes as truth is the class that hides for months. Of 330\nverified findings carrying spans, 58 were this shape.\n\nRepair, per cleri-probe remediation: rethrow, translate into a BytecodeError, or\nreturn a documented fallback that NAMES the error so the degraded state is visible.",
    "addedAt": 1786626515856
  },
  {
    "source": "memory/project-color-dragon-runtime-fork.md",
    "title": "Silent failure: an environment branch returns a degraded but valid value",
    "description": "Silent failure: an environment branch returns a degraded but valid value\nTHE TITLE IS THE HYPOTHESIS and must carry a planner phrase — 'silent failure'\nreaches SWALLOWED_ERROR, which is the nearest registered family. The exact\nshape below has NO cleri-probe verifier, because the degradation is a deliberate\nbranch rather than a catch; it is hunted by innate rules ARCH-0F0D and ARCH-0F0E\ninstead. This antigen exists so the sweep still surfaces the neighbourhood.\n\nA module reads `typeof window` to decide which runtime it is in, skips loading\nits data source on one branch, and returns a bare `false` or `null` that the\ncaller consumes as an availability answer. Callers keep asking it for truth. The\ntwo runtimes then answer the same question differently, and neither says so.\n\nMeasured 2026-08-13. cmu.phoneme.engine.js returns false from init in a browser,\nso the UI has no pronunciation dictionary and falls back to letter-splitting.\nSILENCE resolves to S AY1 L AH0 N S on the server and S IH0 L EH1 N K in the\nbrowser; 3 of 8 sampled words disagreed on the vowel family that drives colour.\nEight UI sites derive phonemes this way.\n\nNothing detected it for two reasons worth remembering. A deliberate branch is\ninvisible to every catch-shaped verifier. And the tests run under jsdom, where\nwindow is defined, so the suite exercises the broken branch and agrees with\nitself — a green suite was evidence of nothing.\n\nRepair: name the degradation so a caller can see it, or better, do not compute\nthe authority in the UI at all. Serve it and consume it.",
    "addedAt": 1786626515857
  },
  {
    "source": "memory/project-empty-collection-truthiness.md",
    "title": "An empty array is truthy, so the empty collection branch never fires",
    "description": "An empty array is truthy, so the empty collection branch never fires\nTHE TITLE IS THE HYPOTHESIS. The planner matches EXACT PHRASES; this one carries\n'empty array' and 'empty collection', which reach EMPTY_COLLECTION_TRUTHINESS.\n\nThe defect is a bare `!items` used to ask whether a collection is empty. It is\nnot: `[]` and `new Map()` are both truthy, so the branch can only fire when the\nproducer returned null or undefined. Where the convention is that \"nothing to\nsay\" is an empty array — as it is for the injected part-of-speech lexicon — the\nescape hatch cannot fire for any caller that follows the convention.\n\nMeasured 2026-08-13 over 3,268 tracked source files: exactly one verified\nfinding, codex/core/constellation/compose.js:194 in atomsFor. Line 175 of the\nsame function reads `known && known.length > 0`, which is the author proving an\nempty row is reachable; line 194 then reads `!known` and cannot see it. Effect,\nmeasured earlier on 5,643 gold phrases: 100% of 940 capitalised proper-noun\ntypes lose their PROPN atom at index 0 and 40.3% get no atoms at all, so span\ncoverage sits 2.8pp below where `!known?.length` would put it.\n\nThe verifier only reports the shape where one function tests the same binding\nboth ways. A lone `!items` may be a correct nullish guard, and a branch that\nreturns or throws is a bail-out, not an emptiness test — both are hard negatives.\n\nRepair: ask the collection about its size. `if (!items?.length)` answers the\nmissing case and the empty case at once.",
    "addedAt": 1786626515867
  }
];
