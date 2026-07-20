/**
 * SEMANTIC CALCULUS — harvested Probe formulas (rev 7 P1)
 *
 * Harvested inquiry formulas. Not a generic probe language.
 * effect is always read-only; maxRisk is always read_only.
 * Compiler never executes harnesses — only seals plans/reports.
 */

import { SEMANTIC_CALCULUS_ERRORS } from './types.ts';
import type {
  CausalHypothesis,
  ObservationRequest,
  ProbePlanPayload,
} from './types.ts';

export interface ProbeFormula {
  id: string;
  version: string;
  /** Patterns that bind this probe (normalized lowercase). */
  patterns: readonly string[];
  keywords: readonly string[];
  observations: readonly ObservationRequest[];
  hypotheses: readonly CausalHypothesis[];
  maxRisk: 'read_only';
  citeSeeds: readonly string[];
}

const CSP_PROBE = Object.freeze<ProbeFormula>({
  id: 'runtime.csp.img_src',
  version: '1.0.0',
  patterns: [
    'why are covers blank',
    'why is cover art missing',
    'why suno art not showing',
    'diagnose csp images',
    'why images blocked in production',
  ],
  keywords: ['csp', 'img-src', 'cover art', 'cdn2.suno', 'content security'],
  observations: [
    {
      id: 'obs.csp.header',
      description: 'Read Content-Security-Policy img-src from the production document response',
      harness: 'http.response_headers.csp',
      required: true,
    },
  ],
  hypotheses: [
    {
      id: 'h_csp_blocks_cdn2',
      claim: 'Production CSP img-src omits https://cdn2.suno.ai so Suno covers are blocked',
      predictions: [
        {
          id: 'p_csp_present',
          description: 'CSP header is present',
          required: true,
          observationId: 'obs.csp.header',
        },
      ],
      falsifiers: [
        {
          id: 'f_csp_allows_cdn2',
          description: 'img-src explicitly allows cdn2.suno.ai',
          observationId: 'obs.csp.header',
          predicate: { op: 'csp_allows_host', host: 'cdn2.suno.ai' },
        },
      ],
      citeSeeds: ['codex/server/index.js', 'imgSrc'],
    },
    {
      id: 'h_csp_allows_images',
      claim: 'CSP permits cdn2 — cover blankness is not a CSP img-src failure',
      predictions: [
        {
          id: 'p_allows',
          description: 'cdn2 allowed',
          required: true,
          observationId: 'obs.csp.header',
        },
      ],
      falsifiers: [
        {
          id: 'f_blocks',
          description: 'cdn2 blocked by img-src',
          observationId: 'obs.csp.header',
          predicate: { op: 'csp_blocks_host', host: 'cdn2.suno.ai' },
        },
      ],
      citeSeeds: ['codex/server/index.js'],
    },
  ],
  maxRisk: 'read_only',
  citeSeeds: ['codex/server/index.js'],
});

const CDN_PROBE = Object.freeze<ProbeFormula>({
  id: 'cdn.asset.http',
  version: '1.0.0',
  patterns: [
    'why cover url 403',
    'diagnose suno cdn covers',
    'why video gen cover fails',
  ],
  keywords: ['403', 'cdn', 'cover url', 'video_gen', 'hotlink'],
  observations: [
    {
      id: 'obs.cdn.head',
      description: 'HTTP HEAD coverUrl values from Visualiser track metadata',
      harness: 'http.head.cover_urls',
      required: true,
    },
  ],
  hypotheses: [
    {
      id: 'h_cdn_403',
      claim: 'Some cover URLs return HTTP 403 from Suno CDN',
      predictions: [
        {
          id: 'p_has_403',
          description: 'At least one HEAD is 403',
          required: true,
          observationId: 'obs.cdn.head',
        },
      ],
      falsifiers: [
        {
          id: 'f_all_200',
          description: 'All sampled URLs return 200',
          observationId: 'obs.cdn.head',
          predicate: { op: 'eq', path: 'allOk', value: true },
        },
      ],
      citeSeeds: ['src/pages/Visualiser/tracks'],
    },
  ],
  maxRisk: 'read_only',
  citeSeeds: ['src/pages/Visualiser/tracks'],
});

const RENDER_STACK_PROBE = Object.freeze<ProbeFormula>({
  id: 'render.stack.listen',
  version: '1.0.0',
  patterns: [
    'why listen animations fail',
    'why listen page stutters',
    'diagnose listen render stack',
    'why listen janks on low tier',
  ],
  keywords: ['listen', 'stutter', 'webgl', 'phaser', 'dual gpu', 'low tier', 'animation'],
  observations: [
    {
      id: 'obs.render.active_contexts',
      description: 'Count active WebGL/WebGL2 contexts and Phaser games on /listen',
      harness: 'dom.webgl.context_count',
      required: true,
    },
  ],
  hypotheses: [
    {
      id: 'h_dual_webgl',
      claim: 'Multiple simultaneous GPU pipelines (Phaser + WebGL2 shader + canvas) exhaust low-tier budgets',
      predictions: [
        {
          id: 'p_multi',
          description: 'More than one WebGL context active',
          required: true,
          observationId: 'obs.render.active_contexts',
        },
      ],
      falsifiers: [
        {
          id: 'f_single',
          description: 'Only one GPU context active',
          observationId: 'obs.render.active_contexts',
          predicate: { op: 'eq', path: 'webglContexts', value: 1 },
        },
      ],
      citeSeeds: [
        'src/pages/Listen/AlchemicalLabBackground.tsx',
        'src/ui/animation/pbstage/PBShaderStage.tsx',
      ],
    },
    {
      id: 'h_reduced_motion',
      claim: 'prefers-reduced-motion is forcing a static chamber',
      predictions: [
        {
          id: 'p_prm',
          description: 'reduced motion media query matches',
          required: true,
          observationId: 'obs.render.active_contexts',
        },
      ],
      falsifiers: [
        {
          id: 'f_not_prm',
          description: 'reduced motion is false',
          observationId: 'obs.render.active_contexts',
          predicate: { op: 'eq', path: 'prefersReducedMotion', value: false },
        },
      ],
      citeSeeds: ['src/hooks/usePrefersReducedMotion.js'],
    },
  ],
  maxRisk: 'read_only',
  citeSeeds: ['src/pages/Listen'],
});

const STATION_VIS_PROBE = Object.freeze<ProbeFormula>({
  id: 'motion.visibility.station',
  version: '1.0.0',
  patterns: [
    'why station animates offscreen',
    'diagnose scholomance station visibility',
    'is crystal ball running when closed',
  ],
  keywords: ['station', 'crystal ball', 'offscreen', 'visibility', 'scholomance station'],
  observations: [
    {
      id: 'obs.station.mount',
      description: 'Whether CrystalBallVisualizer mounts only when viewMode is STATION',
      harness: 'react.mount.station_crystal',
      required: true,
    },
  ],
  hypotheses: [
    {
      id: 'h_station_always_on',
      claim: 'CrystalBall Phaser runs while Scholomance Station is not visible',
      predictions: [
        {
          id: 'p_mounted_closed',
          description: 'CrystalBall mounted in CHAMBER mode',
          required: true,
          observationId: 'obs.station.mount',
        },
      ],
      falsifiers: [
        {
          id: 'f_only_station',
          description: 'Mounted only when STATION',
          observationId: 'obs.station.mount',
          predicate: { op: 'eq', path: 'mountedOnlyWhenStation', value: true },
        },
      ],
      citeSeeds: [
        'src/pages/Listen/CrystalBallVisualizer.tsx',
        'src/pages/Listen/ListenPage.tsx',
      ],
    },
  ],
  maxRisk: 'read_only',
  citeSeeds: ['src/pages/Listen/ScholomanceStation.tsx'],
});

/**
 * The TrueSight "crash after ~4000 chars" — open since 2026-07-13 and never
 * reproduced. Two prior investigations left THREE live suspects and no verdict,
 * which is exactly the shape this formula exists to hold: the suspects are not
 * rivals for one crown. Server heap is additive, so several may hold at once,
 * and one of them (h_swallowed_error) explains the APPEARANCE rather than the
 * allocation and could be true alongside any other.
 *
 * Written before any observation ran. That ordering is the whole point of the
 * plan/report split: hypotheses chosen after looking at the evidence are not
 * hypotheses, they are descriptions.
 */
const TRUESIGHT_OOM_PROBE = Object.freeze<ProbeFormula>({
  id: 'truesight.payload.oom',
  version: '2.0.0',
  patterns: [
    'why does truesight crash after 4000 chars',
    'why does truesight crash on long documents',
    'why does the read page go grey',
    'diagnose truesight oom',
  ],
  keywords: ['truesight', 'oom', 'crash', '4000 chars', 'panel analysis', 'payload'],
  observations: [
    {
      id: 'obs.cache.bound',
      description: 'Read the panel-analysis response cache entry bound (max retained payloads)',
      harness: 'source.read.constant',
      required: true,
    },
    {
      id: 'obs.rhyme.line_window',
      description: 'Read the rhyme connection line-distance failsafe and whether every admission site enforces it',
      harness: 'source.read.constant',
      required: true,
    },
    {
      id: 'obs.phrase.server_alloc',
      description: 'Determine whether phrase_compound connections are still BUILT server-side while wire-excluded',
      harness: 'source.read.flow',
      required: true,
    },
    {
      id: 'obs.payload.scaling',
      description: 'Measure payload bytes-per-input-char at 1k/2k/4k chars. A ratio that GROWS is the quadratic.',
      harness: 'measure.payload.scaling',
      required: true,
    },
    {
      id: 'obs.synthesis.error_path',
      description: 'Determine whether the client swallows a backend failure and degrades to zero connections',
      harness: 'source.read.flow',
      required: true,
    },
    {
      id: 'obs.host.memory',
      description:
        'Read the PRODUCTION host memory ceiling and compute the cache bound\'s maximum footprint against it (boundBytes / availableBytes)',
      harness: 'fly.machine.meminfo',
      required: true,
    },
  ],
  hypotheses: [
    {
      id: 'h_lru_cache',
      claim:
        'The cache is bounded by COUNT while its entries are bounded by DOCUMENT LENGTH, on a host bounded by BYTES — so the bound is not a bound. 1000 entries x ~1.6MB at 4000 chars is ~1.6GB against ~240MB available: the cache cannot approach its own limit without killing the host first.',
      predictions: [
        {
          id: 'p_bound_exceeds_host',
          description: 'The cache bound\'s maximum footprint exceeds host available memory (ratio > 1)',
          required: true,
          observationId: 'obs.host.memory',
        },
      ],
      falsifiers: [
        {
          // v1.0.0 asked only "does a bounded cache exist", which is nearly a
          // tautology — it holds wherever a cache exists, so `supported` meant
          // "nothing refuted it" rather than "evidence favours it". The probe
          // reported that faithfully, which is how the weakness was visible at
          // all. Prod supplied the missing quantity: a 512MB host.
          id: 'f_bound_fits_host',
          description: 'The cache bound\'s maximum footprint fits in available host memory — it cannot be the exhaustion path',
          observationId: 'obs.host.memory',
          predicate: { op: 'lte', path: 'boundBytesOverAvailable', value: 1 },
        },
      ],
      citeSeeds: ['codex/server/routes/panelAnalysis.routes.js', 'fly.toml'],
    },
    {
      id: 'h_rhyme_window',
      claim:
        'Rhyme connections span the whole document because neither bound is a bound on document distance, so connection count grows superlinearly.',
      predictions: [
        { id: 'p_window_absent', description: 'No line-distance failsafe is enforced', required: true, observationId: 'obs.rhyme.line_window' },
      ],
      falsifiers: [
        {
          id: 'f_window_enforced',
          description: 'A line-distance failsafe is enforced at every admission site',
          observationId: 'obs.rhyme.line_window',
          predicate: { op: 'truthy', path: 'enforcedAtAllAdmissionSites' },
        },
      ],
      citeSeeds: ['codex/core/rhyme-astrology/deepRhyme.engine.js'],
    },
    {
      id: 'h_phrase_alloc',
      claim:
        'phrase_compound (~38 connections per word) is wire-excluded but still built and held server-side. The wire fix stopped the transmission, not the allocation.',
      predictions: [
        { id: 'p_built_anyway', description: 'phrase_compound is generated server-side despite wire exclusion', required: true, observationId: 'obs.phrase.server_alloc' },
      ],
      falsifiers: [
        {
          id: 'f_generation_gated',
          description: 'phrase_compound generation is gated off server-side, not merely filtered at the wire',
          observationId: 'obs.phrase.server_alloc',
          predicate: { op: 'truthy', path: 'generationGatedOff' },
        },
      ],
      citeSeeds: ['codex/server/services/panelAnalysis.service.js'],
    },
    {
      id: 'h_quadratic_live',
      claim:
        'The payload is still superlinear in document length: bytes-per-char rises as input doubles.',
      predictions: [
        { id: 'p_ratio_grows', description: 'bytes-per-char at 4k exceeds bytes-per-char at 1k', required: true, observationId: 'obs.payload.scaling' },
      ],
      falsifiers: [
        {
          id: 'f_ratio_flat',
          description: 'bytes-per-char is flat or falling as input doubles — growth is linear',
          observationId: 'obs.payload.scaling',
          predicate: { op: 'lte', path: 'ratio4kOver1k', value: 1.15 },
        },
      ],
      citeSeeds: ['codex/server/services/panelAnalysis.service.js'],
    },
    {
      id: 'h_swallowed_error',
      claim:
        'It is not a crash. The client catches a backend failure, degrades to local synthesis which produces no connections, the colouring gate empties, and everything greys — which is reported as a crash.',
      predictions: [
        { id: 'p_catch_degrades', description: 'A catch in the live path degrades silently to zero connections', required: true, observationId: 'obs.synthesis.error_path' },
      ],
      falsifiers: [
        {
          id: 'f_no_silent_catch',
          description: 'No catch in the live path degrades silently',
          observationId: 'obs.synthesis.error_path',
          predicate: { op: 'falsy', path: 'catchDegradesSilently' },
        },
      ],
      citeSeeds: ['src/hooks/useVerseSynthesis.js'],
    },
  ],
  maxRisk: 'read_only',
  citeSeeds: ['codex/server/routes/panelAnalysis.routes.js'],
});

/**
 * An animation is visibly running where nobody can see it: a glowing arc clipped
 * into the top-left of /listen, behind the APERTURE panel, in CHAMBER mode.
 *
 * CONTAMINATION DECLARED. This formula was written AFTER reading
 * AlchemicalLabScene (cx = W*0.5, cy = H*0.50) and the Phaser config
 * (width: el.offsetWidth || window.innerWidth). That is structure, not runtime:
 * every observation below is a runtime fact no one has collected, and the
 * hypotheses are about runtime. A formula written after seeing the ANSWER would
 * be a description wearing a hypothesis costume — this one is written after
 * seeing the MAP.
 *
 * The rival that must stay on the table: the background is a background. Seeing
 * a corner of it may be the design working. h_intended exists so that answer can
 * win.
 */
const LISTEN_HIDDEN_ANIM_PROBE = Object.freeze<ProbeFormula>({
  id: 'listen.hidden.animation',
  version: '2.0.0',
  patterns: [
    'why is there an arc in the top left corner',
    'exponential processing of animations',
    'is an animation running hidden behind z layering',
    'diagnose listen hidden animation',
    'why is the background off centre',
  ],
  keywords: ['animation', 'z layering', 'hidden', 'top left', 'off centre', 'off center', 'occluded', 'hexagram'],
  observations: [
    {
      id: 'obs.canvas.inventory',
      description: 'Count canvases on /listen and report each one\'s internal resolution, CSS box, and parent',
      harness: 'dom.canvas.inventory',
      required: true,
    },
    {
      id: 'obs.scene.center',
      description: 'Where the scene believes the viewport centre is (scale.width/height at runtime) vs the element it renders into',
      harness: 'phaser.scene.metrics',
      required: true,
    },
    {
      id: 'obs.raf.occluded',
      description: 'Whether the background game still ticks while CHAMBER occludes it, and at what rate',
      harness: 'phaser.loop.tick_rate',
      required: true,
    },
  ],
  hypotheses: [
    {
      id: 'h_orphan_canvas',
      claim:
        'A second Phaser canvas is orphaned on the page (StrictMode double-mount), drawing its own centred scene at a size nobody laid out — so its arc lands in the corner while the live canvas draws correctly.',
      predictions: [
        {
          id: 'p_multiple_canvases',
          description: 'More than one canvas is mounted on /listen',
          required: true,
          observationId: 'obs.canvas.inventory',
          predicate: { op: 'gt', path: 'canvasCount', value: 1 },
        },
      ],
      falsifiers: [
        {
          id: 'f_single_canvas',
          description: 'Exactly one canvas is mounted — nothing was orphaned',
          observationId: 'obs.canvas.inventory',
          predicate: { op: 'eq', path: 'canvasCount', value: 1 },
        },
      ],
      citeSeeds: ['src/pages/Listen/AlchemicalLabBackground.tsx', 'src/ui/animation/phaser-runtime.adapter'],
    },
    {
      id: 'h_stale_size',
      claim:
        'The game was sized from el.offsetWidth before layout, so the scene centres on a stale/fallback size. cx = W*0.5 is correct arithmetic over a wrong W, which puts the hexagram in the corner.',
      predictions: [
        {
          id: 'p_size_mismatch',
          description: 'The scene centre lands away from the element centre',
          required: true,
          observationId: 'obs.scene.center',
          predicate: { op: 'gt', path: 'centerOffsetPx', value: 2 },
        },
      ],
      falsifiers: [
        {
          id: 'f_size_matches',
          description: 'Scene dimensions match the rendered element within a pixel or two',
          observationId: 'obs.scene.center',
          predicate: { op: 'lte', path: 'centerOffsetPx', value: 2 },
        },
      ],
      citeSeeds: ['src/pages/Listen/AlchemicalLabBackground.tsx', 'src/pages/Listen/scenes/AlchemicalLabScene.js'],
    },
    {
      id: 'h_occluded_burn',
      claim:
        'Independent of position: the background game runs a full-rate WEBGL loop while CHAMBER occludes nearly all of it, so the GPU fills pixels no one sees. Wasteful whether or not the centring is wrong.',
      predictions: [
        {
          id: 'p_ticks_occluded',
          description: 'The loop ticks above 30fps while occluded',
          required: true,
          observationId: 'obs.raf.occluded',
          predicate: { op: 'gt', path: 'fpsWhileOccluded', value: 30 },
        },
      ],
      falsifiers: [
        {
          id: 'f_throttled',
          description: 'The loop is paused or throttled while occluded',
          observationId: 'obs.raf.occluded',
          predicate: { op: 'lte', path: 'fpsWhileOccluded', value: 5 },
        },
      ],
      citeSeeds: ['src/pages/Listen/ListenPage.tsx'],
    },
    {
      id: 'h_intended',
      claim:
        'No bug. One correctly-sized canvas, centred, and the arc is the atmosphere layer showing at the edge of the chamber exactly as designed.',
      predictions: [
        {
          id: 'p_centred',
          description: 'The scene centre matches the element centre',
          required: true,
          observationId: 'obs.scene.center',
          predicate: { op: 'lte', path: 'centerOffsetPx', value: 2 },
        },
        {
          id: 'p_uniform_scale',
          description: 'The canvas is not distorted — an intended background is not squeezed on one axis',
          required: true,
          observationId: 'obs.scene.center',
          predicate: { op: 'falsy', path: 'nonUniformScale' },
        },
      ],
      falsifiers: [
        {
          id: 'f_off_centre',
          description: 'The scene centre is materially off from the element centre',
          observationId: 'obs.scene.center',
          predicate: { op: 'gt', path: 'centerOffsetPx', value: 2 },
        },
      ],
      citeSeeds: ['src/pages/Listen/AlchemicalLabBackground.tsx'],
    },
  ],
  maxRisk: 'read_only',
  citeSeeds: ['src/pages/Listen/AlchemicalLabBackground.tsx'],
});

/**
 * Auditor: "performance sucks." Candidate: excessive painting / per-frame
 * animation instances. Written before receipts — rivals stay on the table.
 *
 * Two failure shapes that must not collapse:
 *   1. Overpaint — GPU/CSS paints pixels that don't change or aren't visible
 *   2. Frame fan-out — each tick mints its own rAF / motion instance / tween
 *      instead of one shared loop
 */
const PAINT_OVERDRAW_PROBE = Object.freeze<ProbeFormula>({
  id: 'render.paint.overdraw',
  version: '1.0.0',
  patterns: [
    'why do we have performance issues',
    'why excessive painting',
    'why is performance slow because of painting',
    'why paint jank',
    'diagnose excessive painting',
    'why are animation frames created individually',
    'why does each frame spawn its own animation',
    'diagnose per frame animation allocation',
  ],
  keywords: [
    'paint',
    'painting',
    'overpaint',
    'overdraw',
    'raf',
    'requestanimationframe',
    'per frame',
    'animation frame',
    'frame budget',
    'layout thrash',
  ],
  observations: [
    {
      id: 'obs.paint.rect_rate',
      description:
        'PerformanceObserver (or CDP) paint/layout counts: paint rects per second and % of viewport covered while idle on the hot route',
      harness: 'perf.paint.rect_rate',
      required: true,
    },
    {
      id: 'obs.raf.callback_inventory',
      description:
        'Count concurrent requestAnimationFrame callbacks and whether new callbacks are registered every tick vs one shared loop',
      harness: 'perf.raf.callback_inventory',
      required: true,
    },
    {
      id: 'obs.anim.instance_spawn',
      description:
        'Spawn rate of animation/tween/motion instances per second (WAAPI, Framer, GSAP, Phaser tweens) while the UI is visually idle',
      harness: 'perf.anim.instance_spawn',
      required: true,
    },
  ],
  hypotheses: [
    {
      id: 'h_overpaint',
      claim:
        'Performance cost is excessive painting: large or full-viewport paint rects fire every frame even when content is unchanged.',
      predictions: [
        {
          id: 'p_paint_hot',
          description: 'Paint rect rate stays high while the page is visually idle',
          required: true,
          observationId: 'obs.paint.rect_rate',
          predicate: { op: 'gt', path: 'paintsPerSecondIdle', value: 30 },
        },
      ],
      falsifiers: [
        {
          id: 'f_paint_quiet',
          description: 'Idle paint rate is low — painting is not the hot path',
          observationId: 'obs.paint.rect_rate',
          predicate: { op: 'lte', path: 'paintsPerSecondIdle', value: 5 },
        },
      ],
      citeSeeds: ['src/pages/Listen', 'src/index.css'],
    },
    {
      id: 'h_per_frame_anim_spawn',
      claim:
        'Animation frames are created individually: each tick (or each element) mints a new rAF callback / tween / motion instance instead of one shared loop, so work grows with frame count rather than scene complexity.',
      predictions: [
        {
          id: 'p_spawn_per_tick',
          description: 'New animation or rAF registrations appear every frame while idle',
          required: true,
          observationId: 'obs.anim.instance_spawn',
          predicate: { op: 'gt', path: 'spawnsPerSecondIdle', value: 10 },
        },
      ],
      falsifiers: [
        {
          id: 'f_shared_loop',
          description: 'One stable shared loop; spawn rate near zero while idle',
          observationId: 'obs.anim.instance_spawn',
          predicate: { op: 'lte', path: 'spawnsPerSecondIdle', value: 1 },
        },
      ],
      citeSeeds: [
        'src/ui/animation',
        'src/pages/Listen/AlchemicalLabBackground.tsx',
      ],
    },
    {
      id: 'h_raf_fanout',
      claim:
        'Multiple independent rAF chains run at once (fan-out), so frame budget is spent coordinating loops rather than drawing once.',
      predictions: [
        {
          id: 'p_many_callbacks',
          description: 'More than one long-lived rAF callback is active',
          required: true,
          observationId: 'obs.raf.callback_inventory',
          predicate: { op: 'gt', path: 'activeCallbackCount', value: 1 },
        },
      ],
      falsifiers: [
        {
          id: 'f_single_callback',
          description: 'At most one active rAF callback — no fan-out',
          observationId: 'obs.raf.callback_inventory',
          predicate: { op: 'lte', path: 'activeCallbackCount', value: 1 },
        },
      ],
      citeSeeds: ['src/pages/Listen', 'src/ui/animation/pbstage'],
    },
    {
      id: 'h_not_paint',
      claim:
        'Not a paint/frame-spawn problem: idle paint and spawn rates are quiet; the auditor cost lives elsewhere (JS main thread, network, memory).',
      predictions: [
        {
          id: 'p_paint_quiet',
          description: 'Idle paint rate is low',
          required: true,
          observationId: 'obs.paint.rect_rate',
          predicate: { op: 'lte', path: 'paintsPerSecondIdle', value: 5 },
        },
        {
          id: 'p_spawn_quiet',
          description: 'Idle animation spawn rate is low',
          required: true,
          observationId: 'obs.anim.instance_spawn',
          predicate: { op: 'lte', path: 'spawnsPerSecondIdle', value: 1 },
        },
      ],
      falsifiers: [
        {
          id: 'f_paint_or_spawn_hot',
          description: 'Either paint or spawn stays hot while idle',
          observationId: 'obs.paint.rect_rate',
          predicate: { op: 'gt', path: 'paintsPerSecondIdle', value: 30 },
        },
      ],
      citeSeeds: ['docs/scholomance-encyclopedia'],
    },
  ],
  maxRisk: 'read_only',
  citeSeeds: ['src/pages/Listen', 'src/ui/animation'],
});

export const PROBE_FORMULAS: readonly ProbeFormula[] = Object.freeze([
  CSP_PROBE,
  CDN_PROBE,
  RENDER_STACK_PROBE,
  STATION_VIS_PROBE,
  TRUESIGHT_OOM_PROBE,
  LISTEN_HIDDEN_ANIM_PROBE,
  PAINT_OVERDRAW_PROBE,
]);

/**
 * THE FALSIFIABILITY LAW — a hypothesis without a falsifier is not a hypothesis.
 *
 * `falsifiers` is an array, so the type system happily permits an empty one. Feed
 * evaluateHypotheses such a claim and it never sets `elim` or `undetermined`, so
 * the moment its predictions hold it reports SUPPORTED — always, on every corpus,
 * forever. A claim that cannot lose.
 *
 * That is the same shape as every defect this repo produced today:
 * `decision.kind !== decision.kind`; an identity check on an object rebuilt every
 * call; a prediction with no predicate; Phaser's setMask warning and returning.
 * Four checks that could not fail. This law makes the fifth unrepresentable in the
 * one place that exists to kill claims — rejected at construction, not at review,
 * because review is what already missed the other four.
 *
 * Every falsifier carries a predicate by type. The hole was only ever the count.
 */
export function assertFalsifiable(probe: ProbeFormula): void {
  for (const h of probe.hypotheses) {
    if (!h.falsifiers.length) {
      throw new Error(
        `${SEMANTIC_CALCULUS_ERRORS.UNFALSIFIABLE_HYPOTHESIS}: ${probe.id}/${h.id} — ` +
        'no falsifier. Name the observation that would kill it, or it is not a claim.',
      );
    }
    for (const f of h.falsifiers) {
      if (!probe.observations.some((o) => o.id === f.observationId)) {
        throw new Error(
          `${SEMANTIC_CALCULUS_ERRORS.UNFALSIFIABLE_HYPOTHESIS}: ${probe.id}/${h.id}/${f.id} — ` +
          `falsifier asks for "${f.observationId}", which this probe never collects. ` +
          'A falsifier aimed at evidence nobody gathers cannot fire.',
        );
      }
    }
  }
}

/** Enforced at module load: an unfalsifiable formula never reaches a seal. */
for (const probe of PROBE_FORMULAS) assertFalsifiable(probe);

export function getProbe(id: string): ProbeFormula | undefined {
  return PROBE_FORMULAS.find((p) => p.id === id);
}

export function listProbeIds(): string[] {
  return PROBE_FORMULAS.map((p) => p.id);
}

function normalize(s: string): string {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');
}

/**
 * Bind an utterance to a Probe formula via exact pattern or keyword density.
 * Returns undefined when inquiry lexicon misses (caller may Theory + gap procedure).
 */
export function bindInquiryProbe(utterance: string): ProbeFormula | undefined {
  const text = normalize(utterance);
  for (const probe of PROBE_FORMULAS) {
    for (const pat of probe.patterns) {
      if (text === normalize(pat) || text.includes(normalize(pat))) return probe;
    }
  }
  let best: { probe: ProbeFormula; score: number } | undefined;
  for (const probe of PROBE_FORMULAS) {
    let score = 0;
    for (const kw of probe.keywords) {
      if (text.includes(normalize(kw))) score += 1;
    }
    if (score >= 2 && (!best || score > best.score)) best = { probe, score };
  }
  return best?.probe;
}

/** Build a plan payload for sealing. Does NOT run observations. */
export function buildProbePlan(probe: ProbeFormula): ProbePlanPayload {
  return Object.freeze({
    phase: 'plan' as const,
    probeId: probe.id,
    observations: probe.observations,
    hypotheses: probe.hypotheses,
    maxRisk: 'read_only' as const,
    expectedReceipts: probe.observations.map((o) => o.id),
  });
}

export function probeRegistryVersion(): string {
  return PROBE_FORMULAS.map((p) => `${p.id}@${p.version}`).sort().join(',');
}
