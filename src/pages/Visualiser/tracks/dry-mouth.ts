import type { GrimoireTrack } from './types';

// Dry Mouth — a Vaelrix incantation on the custom Scholomance V2 model.
// Honesty law: id, creation date and lyrics below are lifted verbatim from the
// file's own ID3 tags (comment: "made with suno; created=2026-07-18T13:40:10.785Z;
// id=3da79214-e284-4a4e-9ede-e7c1f9a6a4fc"); duration is measured from the master
// (185.71s). Style ("Hip-Hop · Rap") was reported by Vaelrix — the file carries no
// style/model tag; the model is the album-wide custom Scholomance V2. The audio is
// the LOCAL master Vaelrix supplied, served from public/media — not a Suno CDN URL.
// sunoUrl is derived from the embedded id (a provenance link, not verified live),
// and there is no track-specific cover, so it reuses the album art.
export const DRY_MOUTH: GrimoireTrack = {
  id: '3da79214-e284-4a4e-9ede-e7c1f9a6a4fc',
  title: 'Dry Mouth',
  artist: 'Vaelrix',
  model: 'Scholomance V2',
  modelVersion: 'custom',
  duration: 186, // 3:06, measured from the master (185.71s)
  sunoUrl: 'https://suno.com/song/3da79214-e284-4a4e-9ede-e7c1f9a6a4fc',
  // Local master (BASE_URL-relative so it survives a deploy under a subpath),
  // not a Suno CDN URL — Vaelrix supplied the file directly.
  audioUrl: `${import.meta.env.BASE_URL}media/dry-mouth.mp3`,
  // No track-specific cover was supplied; reuse Vaelrix's album art.
  coverUrl: `${import.meta.env.BASE_URL}media/scholomancer-cover.png`,
  meta: [
    ['Duration', '3:06'],
    ['Model', 'Custom Suno model · Scholomance V2'],
    ['Persona', 'Vaelrix'],
    ['Style', 'Hip-Hop · Rap'],
    ['Released', 'July 18, 2026'],
    ['Source', 'Local master'],
  ],
  provenance: {
    statement: 'Crafted with human intention and AI assistance.',
    tools: ['Suno · custom model — Scholomance V2', 'Persona — Vaelrix'],
    assistance: 'Hip-hop · rap',
  },
  // No measured tempo — this track carries no pacing block and falls back to
  // DEFAULT_PACING, whose sync the UI already labels "estimated" (honesty law).
  // Verbatim from the master's embedded lyrics-eng tag, with blank stanza breaks
  // and [Section] directions dropped — the registry carries sung text only.
  lyrics: [
    "Excruciating pain, like a fusillade of shots to the liver",
    "Modicum of thought never reconsiders",
    "He who withers dangling a carrot to antagonize",
    "will never understand the pain of staring at a barren sky",
    "The misery is something deep.",
    "When even tongue in cheek hurts, the wounds replete with agony",
    "Truthfully, the gravity around me making rain drops crater",
    "the ink heavy enough to dent the paper.",
    "My self esteem a deadly vapor",
    "Every time I have it, there's a habit to enact a flavor of despair",
    "consciousness, stays playing musical chairs",
    "Rage in the air,  smell it like the blood on the stairs.",
    "Stomaching fear, as I plummet in abyss, again",
    "Kissing the sinew with a cinnamon stick of sin",
    "I wanted to behave but I have a wicked psyche...",
    "I'm anti-simile because nobody ever likes me.",
    "Standing in the front row",
    "It's easier to blaze this maggot isn't it?",
    "Magazines? Empty it, you're gun ho.",
    "I thought so.",
    "I thought so.",
    "Living life inside doubt",
    "Magnified as high brow suffering",
    "A low key disgust, see my eyes now",
    "Lying down the gauntlet",
    "These people never wanted me, so why now?",
    "I needed water back when I was dry mouth",
    "I could see the faucets open up for others...",
    "I could see the loss underneath the covers...",
    "I could see the filth underneath the gloss...",
    "I could see it all.",
    "It's easier to lacquer than admit a hijacker seems to rap words",
    "using my body as firecracker",
    "Puppeteer a V til it flips into a Tipi",
    "And commandeers the warmth, gate keeping through a CD.",
    "Am I me? A tiny question only seems to complicate",
    "A blind breed of devil seems to climb into my mental state.",
    "He doesn't care about a line to cross, he never did at all",
    "He'd rather shoot a shot if that shot resembles alcohol",
    "They say to take the mask off, I did, and saw a void in space",
    "I couldn't stomach knowing, model locked beneath a poignant hate",
    "I wanted to avoid the state of knowing, cause the gnosis takes",
    "Shadows hover in my room like smoke and makes my focus break",
    "Population one, of a kind of soul that chose to hold a golden Gun",
    "And blow away the Sun to make the coldness come.",
    "I couldn't love, the boulder was too much,  the odious miasma came to choke",
    "Like opium, I chose the whims of broken, made my soul erupt.",
    "Standing in the front row",
    "It's easier to blaze this maggot isn't it?",
    "Magazines? Empty it, you're gun ho.",
    "I thought so.",
    "I thought so.",
    "Living life inside doubt",
    "Magnified as high brow suffering",
    "A low key disgust, see my eyes now",
    "Lying down the gauntlet",
    "These people never wanted me, so why now?",
    "I needed water back when I was dry mouth",
    "I could see the faucets open up for others...",
    "I could see the loss underneath the covers...",
    "I could see the filth underneath the gloss...",
    "I could see it all.",
  ],
  annotations: [],
};
