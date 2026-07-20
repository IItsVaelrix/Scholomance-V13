import type { GrimoireTrack } from './types';

// Bottled Message — a Vaelrix incantation on the custom Scholomance V2 model.
// Honesty law: id, creation date and lyrics below are lifted verbatim from the
// file's own ID3 tags (comment: "made with suno; created=2026-07-17T20:10:16.511Z;
// id=87e9a326-a334-4508-9f93-df807092bcec"); duration is measured from the master
// (274.56s). Unlike the other Scholomancer tracks, the audio here is the LOCAL
// master Damien supplied, served from public/media — not a live-verified Suno CDN
// URL. sunoUrl is derived from the embedded id (a provenance link, not verified
// live), and there is no track-specific cover, so it reuses the album art.
export const BOTTLED_MESSAGE: GrimoireTrack = {
  id: '87e9a326-a334-4508-9f93-df807092bcec',
  title: 'Bottled Message',
  artist: 'Vaelrix',
  model: 'Scholomance V2',
  modelVersion: 'custom',
  duration: 275, // 4:35, measured from the master (274.56s)
  sunoUrl: 'https://suno.com/song/87e9a326-a334-4508-9f93-df807092bcec',
  // Local master (BASE_URL-relative so it survives a deploy under a subpath),
  // not a Suno CDN URL — Damien supplied the file directly.
  audioUrl: `${import.meta.env.BASE_URL}media/bottled-message.mp3`,
  // No track-specific cover was supplied; reuse Damien's album art.
  coverUrl: `${import.meta.env.BASE_URL}media/scholomancer-cover.png`,
  meta: [
    ['Duration', '4:35'],
    ['Model', 'Custom Suno model · Scholomance V2'],
    ['Persona', 'Vaelrix'],
    ['Style', 'Rap · Hyperpop · Emo'],
    ['Released', 'July 17, 2026'],
    ['Source', 'Local master'],
  ],
  provenance: {
    statement: 'Crafted with human intention and AI assistance.',
    tools: ['Suno · custom model — Scholomance V2', 'Persona — Vaelrix'],
    assistance: 'Rap · hyperpop · emo',
  },
  // Fallback only — the alignment artifact takes precedence wherever it loads.
  // Honesty law: every value here is measured or reported, none invented.
  //   bpm .............. 133, reported by Damien, who made the track. It cancels
  //                      out of beatS in lyricLineAt (nominalBeatS divides back
  //                      out), so it cannot move the fallback lyric timing — but
  //                      it is NOT inert: computeFingerprint seeds the entire
  //                      visual off `trackId|bpm|key`, useBeatClock drives the
  //                      video renders, and RitualSyncCard prints it on screen.
  //   leadInS/tailS .... unmeasured; DEFAULT_PACING's 0/0. Not a claim.
  //   *SylPerBeat ...... DEFAULT_PACING's bland even spread. Nobody measured the
  //                      syllable density, and a default is not a claim.
  pacing: {
    bpm: 133,
    leadInS: 0,
    verseSylPerBeat: 1.2,
    chorusSylPerBeat: 1.2,
    tailS: 0,
    coupletCostMax: 0.75,
  },
  // Verbatim from the master's embedded lyrics-eng tag, with blank stanza breaks
  // and [Section] directions dropped — the registry carries sung text only.
  lyrics: [
    "Promise, tell me, my life, is not to you a burden.",
    "lifeless, silence, my mind, is such a wasteful parent",
    "Deadly, empty, worthless, body is filled with sorrow",
    "headless, forlorn, broken, ennui is here tomorrow",
    "Corpses, painting the floor red",
    "Ogre deep in despondence",
    "Potion I keep in my pocket",
    "Ready to leave this planet...",
    "Carbon Monoxide taught me to drop my guard like a rock slide",
    "horrible thoughts, I",
    "Can't erase them, patiently lost my mind",
    "Can't find it",
    "Violence, feeling the violence grow like the heaviness",
    "deep in my eyelids, slow",
    "is the growth of the blue stained",
    "butane mind with a dose of obtuse fame, leaves me in new chains, blind",
    "to the horrible loss...",
    "Tell me, how much does torturing cost?",
    "Is it okay that you opened my chest",
    "to steal all the treasure, til nothing is left?",
    "Damn. I don't pretend",
    "I don't remember the photographs taken",
    "the ones on the mountain",
    "all I see is a person hiding behind what it cost him",
    "Never could afford any diamonds",
    "always was poor, pouring my heart out",
    "Core in a large drought,",
    "Lord, need a sorcerer, hoping the horrid days",
    "stop stabbing with four inch blades",
    "Recording these morbid states",
    "for a chance to absorb these plays",
    "but the acting became the embodiment of saudade",
    "and I'm lost at Sea",
    "Nobody asks what it's costing me",
    "Nobody sees how the caustic sea",
    "emotional upheaval exhausting me",
    "Sorrow stains, and the monster bleeds",
    "body became such an awkward scene",
    "Lost in the flame like a thoughtless beast",
    "bottled the shame with the cost of peace.",
    "Promise, tell me, my life, is not to you a burden.",
    "lifeless, silence, my mind, is such a wasteful parent",
    "Deadly, empty, worthless, body is filled with sorrow",
    "headless, forlorn, broken, ennui is here tomorrow",
    "Promise, tell me, my life, is not to you a burden.",
    "lifeless, silence, my mind, is such a wasteful parent",
    "Deadly, empty, worthless, body is filled with sorrow",
    "headless, forlorn, broken, ennui is here tomorrow",
    "Holographic static in the attic",
    "cytoplasmic grief became a combatant",
    "piecing together the pieces of me that were left",
    "scattered like glass on the planet",
    "Casual tragedy, ammo they have",
    "can erase with disaster's deeds",
    "I can't stop. cause' I have to be",
    "Archaeologist",
    "Find the fossils quick, it's impossible",
    "kicked me out when I was in the hospital",
    "At the time I thought it was improbable",
    "didn't think that we would split like Popsicle",
    "Different logic though,",
    "Wanted to leave, but she made me stay",
    "every time I tried to run away",
    "but the moment I needed foundation, she left",
    "told me she'd never abandon, she did.",
    "Never could trust anybody else since",
    "I'd be dead before I ever love again, right?",
    "Love isn't worth getting stabbed in the chest",
    "Never turned back, only have these regrets",
    "Left her mark like I'm wet cement",
    "Cupid was dumb when he targeted my ribs",
    "I'm disgusting, the cost of exposing my sin",
    "Was the weight of these boulders again",
    "tossed on my back like I'm Sisyphus,",
    "I wanted to love? that's Ridiculous.",
    "Promise, tell me, my life, is not to you a burden.",
    "lifeless, silence, my mind, is such a wasteful parent",
    "Deadly, empty, worthless, body is filled with sorrow",
    "headless, forlorn, broken, ennui is here tomorrow",
    "Promise, tell me, my life, is not to you a burden.",
    "lifeless, silence, my mind, is such a wasteful parent",
    "Deadly, empty, worthless, body is filled with sorrow",
    "headless, forlorn, broken, ennui is here tomorrow",
  ],
  annotations: [],
};
