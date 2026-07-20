import type { GrimoireTrack } from './types';

// Brown Dwarf — a Vaelrix incantation on the custom Scholomance V2 model.
// Honesty law: id, creation date and lyrics below are lifted verbatim from the
// file's own ID3 tags (comment: "made with suno; created=2026-07-13T05:03:08.549Z;
// id=90e19fae-4a2d-4935-978d-f0b319851705"); duration is measured from the master
// (200.04s). Style ("Hip-Hop · Rap") was reported by Vaelrix — the file carries no
// style/model tag; the model is the album-wide custom Scholomance V2. The audio is
// the LOCAL master Vaelrix supplied, served from public/media — not a Suno CDN URL.
// sunoUrl is derived from the embedded id (a provenance link, not verified live),
// and there is no track-specific cover, so it reuses the album art.
export const BROWN_DWARF: GrimoireTrack = {
  id: '90e19fae-4a2d-4935-978d-f0b319851705',
  title: 'Brown Dwarf',
  artist: 'Vaelrix',
  model: 'Scholomance V2',
  modelVersion: 'custom',
  duration: 200, // 3:20, measured from the master (200.04s)
  sunoUrl: 'https://suno.com/song/90e19fae-4a2d-4935-978d-f0b319851705',
  // Local master (BASE_URL-relative so it survives a deploy under a subpath),
  // not a Suno CDN URL — Vaelrix supplied the file directly.
  audioUrl: `${import.meta.env.BASE_URL}media/brown-dwarf.mp3`,
  // No track-specific cover was supplied; reuse Vaelrix's album art.
  coverUrl: `${import.meta.env.BASE_URL}media/scholomancer-cover.png`,
  meta: [
    ['Duration', '3:20'],
    ['Model', 'Custom Suno model · Scholomance V2'],
    ['Persona', 'Vaelrix'],
    ['Style', 'Hip-Hop · Rap'],
    ['Released', 'July 13, 2026'],
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
    "The emotion cascades like waterfalls of rage,",
    "Red rapids of anguish, keep pouring on the page like",
    "Opaque light, the stage strikes, napalms embrace any chain",
    "In my grip, orange metal is a strange light",
    "Lasers blast through the tunnel vision",
    "Carving through graphene when I touch a written",
    "V isn’t fake, He isn’t scared, V doesn’t break",
    "V is a ventriloquist, barely awake",
    "skill exists to syllable script, bars like refillable clips",
    "100 lines every day",
    "Who the fuck blazes the page, day after day",
    "The twelve gauge engages a rib cage",
    "Blast, til the chest dies",
    "Ever since hatred,",
    "became the same type of hardness",
    "I tried to escape, right?",
    "Simian strength shattering stage fright",
    "Lyrical grace gripping the pained mic.",
    "Spiritual space glowing with torment",
    "Fomenting masochist living to erase light “BANG!”",
    "Brown Dwarf hangs in the balance",
    "Radioactive with isotopic violence",
    "Tropical storms exists behind the eyelids",
    "People never know all the suffering I did",
    "To write like this, bloodletting on the mic",
    "Building inside the silence",
    "Vying for the Throne, Poseidon blessing my gift",
    "Brick after brick, sonic thaumaturgic science",
    "Failed little star with a fury in my ribs",
    "Ringo became Rogue, then buried what he did",
    "With an IFS, I ingest this psycho stress",
    "Entire depth like Hydra heads",
    "Flow deep, it’s a bottled truth with dopeness",
    "Deep inside your chest like mononucleosis",
    "Follow you with closeness",
    "Cobblestone lungs bleeding death",
    "See the stress inside swallow you like, OH SHIT!",
    "Myth maker, fakers get parried, couldn’t copy me",
    "Spit danger, that’s the new philosophy",
    "Using logic, suit of armor bleeds so it’s worthless to me",
    "I’d rather the armor of Deuteronomy",
    "Who is stopping me?",
    "Impossible when the armory inside is glowing white",
    "Unmistakable, like a cosmic scream",
    "This poet bleeds, bespoke disease",
    "That flows with ease, my soul bitter",
    "Compression sweeter like coca leaves (WOW!)",
    "Continental stride",
    "Every step I take crosses the horizon line",
    "Giant, Attack on Titan, I’m a real menace",
    "Rap M. Bison, Psycho Power in the field",
    "But my pressure congealed",
    "And the energy of steel lets this identity",
    "Break free to leave a real message",
    "I’ll never be small again",
    "The bloodline inside, it carries the heart of Him",
    "Staring at the mirror like, when do I start again?",
    "NOW IS THE TIME TO SHATTER A HEART OF SIN",
    "I’ll never be small again",
    "The bloodline inside, it carries the heart of Him",
    "Staring at the mirror like, when do I start again?",
    "NOW IS THE TIME TO SHATTER A HEART OF SIN",
    "I’ll never be small again",
    "The bloodline inside, it carries the heart of Him",
    "Staring at the mirror like, when do I start again?",
    "NOW IS THE TIME TO SHATTER A HEART OF SIN",
  ],
  annotations: [],
};
