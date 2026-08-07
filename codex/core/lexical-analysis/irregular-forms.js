/**
 * IRREGULAR FORMS — the words morphology cannot reach
 *
 * `lemma_form` stores base forms plus REGULAR transforms (`noun.plural.s`,
 * `adjective.comparative.er`). Every irregular falls straight through it, and
 * suffix backoff cannot help by definition: the whole point of an irregular is
 * that it carries no suffix to read. `came` is unambiguously a verb and nothing
 * in its spelling says so.
 *
 * Measured: with 71.7% of parse failures dying on an untyped token, irregular
 * pasts (came 48, took 26, knew 19, told 17, gave 11, brought 11) and irregular
 * plurals (children 20, feet 9, women 5) accounted for roughly 240 of 1,049
 * unresolved token instances — from about 220 word types.
 *
 * ─── WHY THIS IS LEGAL IN CORE ────────────────────────────────────────────
 *
 * English has a finite, closed set of irregular verbs and plurals. No one coins
 * a new one. A fixed list is DATA, exactly like the closed classes next door,
 * so nothing here is learned and nothing reads a corpus.
 *
 * ─── PRECEDENCE ───────────────────────────────────────────────────────────
 *
 * The injected lexicon is authoritative and is consulted FIRST. This table
 * speaks only where it is silent, and suffix backoff speaks only after both.
 * `wound` is the irregular past of `wind` AND a common noun — the lexicon knows
 * the noun, so it wins, and this table never overrides it.
 *
 * @module codex/core/lexical-analysis/irregular-forms
 */

/**
 * base -> [past, pastParticiple]. A single entry means past and participle are
 * the same form, which is the common English pattern (`brought`, `told`).
 */
const VERB_TABLE = {
  arise: ['arose', 'arisen'], awake: ['awoke', 'awoken'], bear: ['bore', 'borne'],
  beat: ['beat', 'beaten'], become: ['became'], begin: ['began', 'begun'],
  bend: ['bent'], bet: ['bet'], bid: ['bid'], bind: ['bound'],
  bite: ['bit', 'bitten'], bleed: ['bled'], blow: ['blew', 'blown'],
  break: ['broke', 'broken'], breed: ['bred'], bring: ['brought'],
  build: ['built'], burst: ['burst'], buy: ['bought'], cast: ['cast'],
  catch: ['caught'], choose: ['chose', 'chosen'], cling: ['clung'],
  come: ['came'], cost: ['cost'], creep: ['crept'], cut: ['cut'],
  deal: ['dealt'], dig: ['dug'], draw: ['drew', 'drawn'],
  drink: ['drank', 'drunk'], drive: ['drove', 'driven'], dwell: ['dwelt'],
  eat: ['ate', 'eaten'], fall: ['fell', 'fallen'], feed: ['fed'], feel: ['felt'],
  fight: ['fought'], find: ['found'], flee: ['fled'], fling: ['flung'],
  fly: ['flew', 'flown'], forbid: ['forbade', 'forbidden'],
  forget: ['forgot', 'forgotten'], forgive: ['forgave', 'forgiven'],
  freeze: ['froze', 'frozen'], get: ['got', 'gotten'], give: ['gave', 'given'],
  go: ['went', 'gone'], grind: ['ground'], grow: ['grew', 'grown'],
  hang: ['hung'], hear: ['heard'], hide: ['hid', 'hidden'], hit: ['hit'],
  hold: ['held'], hurt: ['hurt'], keep: ['kept'], kneel: ['knelt'],
  know: ['knew', 'known'], lay: ['laid'], lead: ['led'], leap: ['leapt'],
  leave: ['left'], lend: ['lent'], let: ['let'], lie: ['lay', 'lain'],
  light: ['lit'], lose: ['lost'], make: ['made'], mean: ['meant'],
  meet: ['met'], mistake: ['mistook', 'mistaken'], overcome: ['overcame'],
  pay: ['paid'], put: ['put'], quit: ['quit'], read: ['read'], rid: ['rid'],
  ride: ['rode', 'ridden'], ring: ['rang', 'rung'], rise: ['rose', 'risen'],
  run: ['ran'], say: ['said'], see: ['saw', 'seen'], seek: ['sought'],
  sell: ['sold'], send: ['sent'], set: ['set'], sew: ['sewed', 'sewn'],
  shake: ['shook', 'shaken'], shed: ['shed'], shine: ['shone'], shoot: ['shot'],
  show: ['showed', 'shown'], shrink: ['shrank', 'shrunk'], shut: ['shut'],
  sing: ['sang', 'sung'], sink: ['sank', 'sunk'], sit: ['sat'],
  slay: ['slew', 'slain'], sleep: ['slept'], slide: ['slid'], sling: ['slung'],
  smell: ['smelt'], sow: ['sowed', 'sown'], speak: ['spoke', 'spoken'],
  spend: ['spent'], spill: ['spilt'], spin: ['spun'], spit: ['spat'],
  split: ['split'], spread: ['spread'], spring: ['sprang', 'sprung'],
  stand: ['stood'], steal: ['stole', 'stolen'], stick: ['stuck'],
  sting: ['stung'], stink: ['stank', 'stunk'], strike: ['struck'],
  strive: ['strove', 'striven'], swear: ['swore', 'sworn'], sweep: ['swept'],
  swim: ['swam', 'swum'], swing: ['swung'], take: ['took', 'taken'],
  teach: ['taught'], tear: ['tore', 'torn'], tell: ['told'],
  think: ['thought'], throw: ['threw', 'thrown'], thrust: ['thrust'],
  tread: ['trod', 'trodden'], understand: ['understood'], upset: ['upset'],
  wake: ['woke', 'woken'], wear: ['wore', 'worn'], weave: ['wove', 'woven'],
  weep: ['wept'], win: ['won'], wind: ['wound'], wring: ['wrung'],
  write: ['wrote', 'written'],
  /** Archaic verb forms — Gutenberg's register, not modern English. */
  saith: ['saith'], spake: ['spake'], knoweth: ['knoweth'], cometh: ['cometh'],
  goeth: ['goeth'], doeth: ['doeth'], sayeth: ['sayeth'], hearken: ['hearkened'],
};

/**
 * Surface form -> POS letters.
 *
 * A past PARTICIPLE is tagged verb AND adjective, because `a broken window` and
 * `he had broken it` are both real and the reduced-relative bond consumes the
 * adjectival reading. A simple past is verb only.
 */
export const IRREGULAR_VERB_FORMS = (() => {
  const map = new Map();
  const add = (form, tags) => {
    const existing = map.get(form);
    if (!existing) { map.set(form, [...tags]); return; }
    for (const t of tags) if (!existing.includes(t)) existing.push(t);
  };
  for (const [base, forms] of Object.entries(VERB_TABLE)) {
    add(base, ['v']);
    const [past, participle] = forms;
    if (past) add(past, ['v']);
    if (participle) add(participle, ['v', 'a']);
  }
  return map;
})();

/**
 * Irregular plurals, plus a few unchanging ones (`sheep`, `deer`). Latin and
 * Greek plurals are included because they are common in the kind of expository
 * prose this parser will meet.
 */
export const IRREGULAR_PLURALS = new Map(Object.entries({
  children: ['n'], men: ['n'], women: ['n'], feet: ['n'], teeth: ['n'],
  geese: ['n'], mice: ['n'], lice: ['n'], oxen: ['n'], people: ['n'],
  brethren: ['n'], kine: ['n'],
  sheep: ['n'], deer: ['n'], swine: ['n'], series: ['n'], species: ['n'],
  knives: ['n'], lives: ['n'], wives: ['n'], wolves: ['n'], leaves: ['n'],
  halves: ['n'], calves: ['n'], elves: ['n'], loaves: ['n'], shelves: ['n'],
  thieves: ['n'], selves: ['n'], hooves: ['n'], scarves: ['n'],
  analyses: ['n'], bases: ['n'], crises: ['n'], diagnoses: ['n'],
  hypotheses: ['n'], oases: ['n'], parentheses: ['n'], syntheses: ['n'],
  theses: ['n'], appendices: ['n'], indices: ['n'], matrices: ['n'],
  vertices: ['n'], criteria: ['n'], phenomena: ['n'], data: ['n'],
  media: ['n'], bacteria: ['n'], fungi: ['n'], nuclei: ['n'], radii: ['n'],
  alumni: ['n'], cacti: ['n'], stimuli: ['n'],
}));

/**
 * Look up a form morphology cannot derive.
 *
 * @param {string} token lowercased surface form
 * @returns {string[]} POS letters, or [] when this is not an irregular
 */
export function irregularPos(token) {
  const w = String(token || '').toLowerCase();
  const verb = IRREGULAR_VERB_FORMS.get(w);
  const plural = IRREGULAR_PLURALS.get(w);
  if (verb && plural) return [...new Set([...verb, ...plural])];
  if (verb) return [...verb];
  if (plural) return [...plural];
  return [];
}
