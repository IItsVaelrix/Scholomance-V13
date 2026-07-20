# Ritual Card — Poetic IntelliSense redesign

**Date:** 2026-07-17
**Component:** `src/components/RitualPredictionTooltip.jsx` + `.css`
**Approved mockup:** MTG-card × Lovecraftian card (gold + violet, no tentacles)

## Problem

The current tooltip works but reads as "worthless arcana" next to the polished
features (DivWand/Wand). It surfaces a lot of low-signal engine internals (role
"Anchor/Modifier/Trigger", invented "ritualName", confidence %, why-factor
weights, raw phonology keys like `AA1`/`coda`/`rhymeKey`, "Nearby Signals",
"Scholomance Corpus" sound-alikes, "Arcane Traces") and buries the few things a
writer actually uses. This is a **presentation / information-design** redesign —
the data pipeline is not the problem.

## Goal

Turn the tooltip into a Magic-the-Gathering-style **spellcard** for a word,
drowned in Lovecraftian bioluminescence, that serves exactly four jobs (all
confirmed by the user):

1. **Find a better word** — rhymes / slant / synonyms / antonyms as one-click
   transmute chips (the hero).
2. **Hear the sound** — pronunciation + syllable/stress rhythm, presented
   humanly (no raw engine keys).
3. **See line resonance** — how the word sonically bonds with its line.
4. **Know the meaning** — up to 5 definitions + part of speech.

## Card anatomy (MTG mapping)

| MTG element      | Our content                                             |
|------------------|---------------------------------------------------------|
| Card name        | the word (engraved serif, small-caps feel)              |
| Mana cost        | pronunciation pill (`/boʊld/`, mono)                    |
| Type line        | part-of-speech + syllable pips (hollow=unstressed, gold ring=primary stress) |
| Rules text box   | the four chip rows — rhyme / slant / syn / ant          |
| Flavor text      | up to 5 definitions, italic serif, mono grammar marker  |
| —                | line-resonance ribbon ("in this line")                  |
| Collector line   | source path + `L#·C#`; or "sound estimated from spelling" badge |

### Chip targets (ideal counts; show fewer when fewer exist — never pad)

- **rhyme (perfect): 10** — gold accent
- **slant: 10** — deep-amethyst accent
- **synonyms: 5** — bright-violet accent
- **antonyms: 5** — ichor-red accent

The separate "near" row is dropped (folds into rhyme/slant). Was capped at 8 in
`cleanWordLists`; bump to the per-tier limits above. Definitions were capped at
5 already via a different path — surface up to 5.

## Palette / type (from approved mockup)

- Frame gold `#c9a227` (dark) / `#9a7b1f` (light) — frame + perfect rhyme.
- Eldritch violet — `--purple #b39cff` / `--purple-deep #8a6fd6` (dark). The
  single bold accent. **No teal.**
- Ichor `#d8604d` — antonyms only.
- Bone ink `#d9cfbf` on abyssal obsidian (dark) / sepia on aged vellum (light).
- Serif display + serif italic flavor + mono micro-labels/footer.
- Bioluminescent halo behind the frame (breathes; killed under
  `prefers-reduced-motion`).

## What is CUT (all confirmed)

Role badge + description + `roleSignal`, `ritualName`, confidence % badge +
`confidenceFactors`, "Divination Insights" why-factors, the raw phonology key
grid (`vowelFamily`/`coda`/`rhymeKey`/`extendedRhymeKeys`), "Nearby Signals",
"Scholomance Corpus" section, "Arcane Traces" diagnostics.

Sound survives ONLY as the human syllable-dot + stress + pronunciation in the
type line — no engine keys shown.

## Preserved behavior (skin/layout change only, not a rewrite of logic)

- Drag / resize / positioning (`resolveOverlayPlacement`, `ResizableBox`).
- Breadcrumb navigation + session nav (prev/next).
- Chip **⌕ explore** (navigate card) vs. click-to-**transmute** (swap in text).
- `OracleNotice` on lookup failure (timeout/429/disconnect) — keep; a failed
  lookup must not read as "no rhymes".
- **Honesty rule:** the "estimated from spelling" marker stays (a guessed
  pronunciation must declare itself). When a tier returns fewer than its target,
  show what exists — do not pad with weak matches.
- Embedded (mobile sheet) mode still renders without positioning chrome.

## Files

- `src/components/RitualPredictionTooltip.jsx` — restructure the card body into
  the anatomy above; delete the cut sections; keep the hooks/data plumbing.
- `src/components/RitualPredictionTooltip.css` — reskin to the mockup tokens;
  retire parchment vars, add gold+violet abyssal/vellum token sets for both
  themes.
- `src/lib/ritualPredictionTooltip.js` / lookup limits — bump rhyme/slant to 10,
  syn/ant to 5.

## Testing / verification

- Drive the Read editor (dev `:5173`), click a word, confirm: chips render per
  tier with correct counts, transmute swaps text, ⌕ navigates, breadcrumb +
  session nav work, estimated badge shows for an OOV word (e.g. "saudade"),
  failure shows OracleNotice not an empty card. Verify both themes.
- Existing tooltip/lexical tests still green.
- `npm run scd64:intellisense` on the diff.
