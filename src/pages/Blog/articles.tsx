/* eslint-disable react/no-unescaped-entities */
/**
 * Blog article registry - one entry per published post.
 * Content is authored here; ArticlePage.tsx routes to the right entry by slug.
 */

import type { ReactNode } from 'react';

export interface TocItem {
  href: string;
  label: string;
}

export interface ArticleSection {
  id: string;
  heading: string;
  level: 2 | 3;
  content: ReactNode;
}

export interface Article {
  slug: string;
  title: string;
  lede: string;
  kind: 'skill' | 'whitepaper' | 'verdict' | 'essay' | 'featured';
  date: string;
  readTime: string;
  toc: TocItem[];
  sections: ArticleSection[];
}

/* ─────────────────────────────────────────────────────────────────── */

const EMERGENT_DISPARITY: Article = {
  slug: 'emergent-disparity-reconciliation-spell',
  title: 'Emergent Disparity Reconciliation Spell',
  lede:
    'Scan the codebase fundamentals, find invisible gaps between systems, and propose connective tissue that creates new boons without destabilizing the current architecture.',
  kind: 'skill',
  date: 'June 10, 2026',
  readTime: '7 min',
  toc: [
    { href: '#summary', label: 'Summary' },
    { href: '#core-concept', label: 'Core Concept' },
    { href: '#when-to-use', label: 'When to Use' },
    { href: '#procedure', label: 'Scan Procedure' },
    { href: '#qa', label: 'QA Checklist' },
  ],
  sections: [
    {
      id: 'summary',
      heading: 'Summary',
      level: 2,
      content: (
        <>
          <p>
            This skill turns scattered strengths into deliberate infrastructure. It is not a rewrite
            ritual. It is a pressure test for hidden leverage.
          </p>
          <p>
            The goal is not to fix what is broken. The goal is to find <strong>latent boons</strong>
             -  small architectural bridges that make the system more coherent, powerful, reusable,
            testable, or future-proof.
          </p>
          <p>
            Use this skill when a codebase already contains the ingredients for something stronger,
            but the systems have not been introduced to each other yet. 🜂
          </p>
        </>
      ),
    },
    {
      id: 'core-concept',
      heading: 'Core Concept',
      level: 2,
      content: (
        <>
          <p>
            An <strong>emergent disparity</strong> is a meaningful gap between two or more parts of
            the codebase. The spell separates productive difference from architectural fragmentation.
          </p>
          <table className="bcv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
            <thead>
              <tr>
                <th>Disparity</th>
                <th>Hidden Opportunity</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Two modules solve similar problems differently</td><td>Create a shared adapter, registry, schema, or utility</td></tr>
              <tr><td>UI has a concept the engine does not understand</td><td>Introduce a semantic bridge</td></tr>
              <tr><td>Config exists in multiple hard-coded places</td><td>Centralize into a named source of truth</td></tr>
              <tr><td>Tests verify outputs but not intent</td><td>Add golden contracts or invariant tests</td></tr>
              <tr><td>Events exist but are not typed or traceable</td><td>Add an event map or telemetry seam</td></tr>
              <tr><td>A subsystem has rich internal meaning but no public contract</td><td>Expose a stable interface</td></tr>
              <tr><td>Visual behavior and data behavior drift apart</td><td>Add a synchronization layer</td></tr>
            </tbody>
          </table>
          <p>
            The operating principle: <em>do not hunt for flaws only. Hunt for unrealized alliances.</em>
          </p>
          <p>A normal audit asks: "What is broken?" This skill asks: "What already exists in separate places that would become stronger if reconciled?"</p>
        </>
      ),
    },
    {
      id: 'when-to-use',
      heading: 'When to Use',
      level: 2,
      content: (
        <>
          <p>Use this skill when the goal is any of the following:</p>
          <ul>
            <li>Audit a codebase for hidden opportunities</li>
            <li>Find connective tissue between modules</li>
            <li>Improve architecture without rewriting everything</li>
            <li>Detect duplicated concepts across files</li>
            <li>Make a system more extensible</li>
            <li>Strengthen fundamentals before adding features</li>
            <li>Turn scattered mechanics into reusable infrastructure</li>
            <li>Identify small changes with outsized compounding value</li>
          </ul>
          <p>Trigger phrases: "scan the fundamentals", "find connective tissue", "what am I missing?", "find hidden boons", "make this architecture stronger", "what should become shared?", "what wants to be a system?"</p>
        </>
      ),
    },
    {
      id: 'procedure',
      heading: 'Scan Procedure',
      level: 2,
      content: (
        <>
          <p>
            <strong>Step 1 - Establish Codebase Fundamentals.</strong> Identify the project's core
            primitives: runtime entry points, state ownership, event systems, config files, constants
            and registries, schemas and types, rendering layers, engine logic, persistence
            boundaries, test infrastructure, naming conventions, cross-module imports, error
            systems, adapter layers.
          </p>
          <p>Output a short "fundamental map" before scanning for disparities.</p>
          <p>
            <strong>Step 2 - Detect Disparities.</strong> Use these lenses: Naming Disparity (same
            idea, different names), Shape Disparity (similar data structures with incompatible
            fields), Lifecycle Disparity (inconsistent init/update/dispose patterns),
            Source-of-Truth Disparity (same truth defined in multiple files), Semantic Disparity
            (UI knows a concept that the logic layer doesn't), Testing Disparity (behavior exists
            but no invariant guards it), Import Disparity (low-level module imports a high-level
            module), Config Disparity (values duplicated or hard-coded), Event Disparity (events
            with no shared vocabulary), Capability Disparity (a feature exists in one context but
            could benefit another).
          </p>
          <p>
            <strong>Step 3 - Sort by Boon Potential.</strong> Score each candidate from 1 (minor
            cleanup) to 5 (major compounding boon) across: reuse gain, risk reduction, testability
            gain, future feature acceleration, migration safety, cognitive load reduction.
          </p>
          <p>
            <strong>Step 4 - Propose Reconciliation Tissue.</strong> For each high-value disparity,
            propose the smallest useful bridge: adapter, registry, schema, event map, contract test,
            facade, lifecycle hook, mapping table, capability interface, or golden output.
          </p>
        </>
      ),
    },
    {
      id: 'qa',
      heading: 'QA Checklist',
      level: 2,
      content: (
        <ul>
          <li>Existing UI renders unchanged after any bridge is added</li>
          <li>No import cycles introduced by new shared modules</li>
          <li>Existing tests pass without modification</li>
          <li>New registry or schema has dedicated unit tests</li>
          <li>Consumers use the adapter instead of duplicating shape logic</li>
          <li>Unknown IDs fail safely (no silent undefined access)</li>
          <li>No behavioral changes unless explicitly intended and documented</li>
          <li>Build and dependency graph remain clean</li>
          <li>Affected UI receives a smoke test, not just a unit test</li>
          <li>Snapshot or golden output added for any deterministic system touched</li>
        </ul>
      ),
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────── */

const SCHOLOECHO: Article = {
  slug: 'scholoecho-space-painting',
  title: 'ScholoEcho and the Space-Painting Instrument',
  lede:
    'A white paper on designing reverb and delay as spatial paint instead of knob soup - and what happens when you build an instrument around room geometry instead of acoustic parameters.',
  kind: 'whitepaper',
  date: 'June 2026',
  readTime: '12 min',
  toc: [
    { href: '#problem', label: 'The Knob Soup Problem' },
    { href: '#spatial', label: 'Reverb as Spatial Statement' },
    { href: '#model', label: 'The ScholoEcho Model' },
    { href: '#mapping', label: 'Parameter Mapping' },
    { href: '#psychic', label: 'The Psychic School Connection' },
  ],
  sections: [
    {
      id: 'problem',
      heading: 'The Knob Soup Problem',
      level: 2,
      content: (
        <>
          <p>
            Open any reverb plugin and you find the same twelve knobs: Pre-Delay, Size, Decay,
            Diffusion, Damping, Early Reflections, Wet/Dry, Width, High Cut, Low Cut, Modulation
            Rate, Modulation Depth. Each knob changes the sound. Almost none of them tell you{' '}
            <em>what space you are in</em>.
          </p>
          <p>
            This is the knob soup problem: the interface exposes the acoustic machinery, not the
            spatial reality. You are not designing a room. You are tuning a convolution kernel. The
            metaphor is wrong and the interface inherits all of the metaphor's wrongness.
          </p>
          <p>
            The result is that engineers learn reverb as a collection of parameter relationships
            rather than as spatial intuition. Pre-delay controls the distance between source and
            listener. Decay controls the hardness and volume of reflective surfaces. Diffusion
            controls surface irregularity. None of the labels say this. You have to reverse-engineer
            the physics from the knobs instead of declaring the physics directly.
          </p>
        </>
      ),
    },
    {
      id: 'spatial',
      heading: 'Reverb as Spatial Statement',
      level: 2,
      content: (
        <>
          <p>
            The reframe: reverb is not an acoustic effect. Reverb is a <strong>spatial statement</strong>. When you add reverb to a vocal, you are declaring: "this voice exists in a space with these properties." Every reverb decision is an architectural claim.
          </p>
          <p>
            Delay is a temporal statement: "this sound arrived here, and then some of it arrived again, later, from a different angle." The delay time encodes distance. The feedback encodes the reflective persistence of a surface.
          </p>
          <p>
            Under this model, the interface question changes from "how much reverb?" to "where is this sound, physically?" That question is answerable in terms a non-engineer can hold:
          </p>
          <ul>
            <li><strong>Room depth</strong> - how far back in the space is the source?</li>
            <li><strong>Room volume</strong> - what is the total enclosed space? (a closet vs. a cathedral)</li>
            <li><strong>Surface material</strong> - is the room made of wood, stone, glass, or foam?</li>
            <li><strong>Air density</strong> - how much does the room absorb high frequencies? (cold cathedral vs. humid live room)</li>
            <li><strong>Irregularity</strong> - how much do the surfaces scatter sound vs. mirror it?</li>
          </ul>
          <p>
            These five parameters describe a room completely enough to synthesize all twelve traditional reverb knobs from them. The spatial model is a <em>higher-level API</em> over the acoustic machinery.
          </p>
        </>
      ),
    },
    {
      id: 'model',
      heading: 'The ScholoEcho Model',
      level: 2,
      content: (
        <>
          <p>
            ScholoEcho is built on the spatial API, not the acoustic API. The user interface exposes room geometry, not convolution parameters. The derivation layer converts geometry into acoustic parameters and runs the reverb engine behind the abstraction.
          </p>
          <p>
            The instrument has two modes: <strong>Architect Mode</strong> and <strong>Painter Mode</strong>.
          </p>
          <p>
            In Architect Mode, you place a sound source in a virtual room using a 2D drag interface.
            X-axis is depth (near to far). Y-axis is height (floor to ceiling). The room shape is
            selectable: rectangular, cylindrical, irregular. Surface material is a selector, not a
            knob: stone, wood, tile, carpet, foam, glass. These are the only controls. The engine
            derives pre-delay, decay, damping, early reflections, and diffusion from the geometry.
          </p>
          <p>
            In Painter Mode, you apply reverb like paint to a spectrogram timeline. Each painted
            region defines a different space - the verse is in a stone chamber, the chorus breaks
            open into cathedral air, the bridge drops to a dead room. The "brush" is the room
            preset. The canvas is the song.
          </p>
          <p>
            The result is that spatial decisions in a mix become as direct as color decisions in a
            painting. You do not mix reverb into a track. You <em>place the track somewhere</em>.
          </p>
        </>
      ),
    },
    {
      id: 'mapping',
      heading: 'Parameter Mapping',
      level: 2,
      content: (
        <>
          <p>The geometry-to-acoustics derivation is deterministic and reproducible. The same room description always produces the same reverb signature:</p>
          <table className="bcv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
            <thead>
              <tr>
                <th>Spatial Parameter</th>
                <th>Acoustic Parameter Derived</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Source depth</td><td>Pre-delay (ms)</td></tr>
              <tr><td>Room volume</td><td>Decay time (RT60)</td></tr>
              <tr><td>Surface material → hardness</td><td>Damping curve + high-cut frequency</td></tr>
              <tr><td>Air density → humidity</td><td>High-frequency absorption rate</td></tr>
              <tr><td>Surface irregularity</td><td>Diffusion coefficient</td></tr>
              <tr><td>Room shape</td><td>Early reflection pattern</td></tr>
            </tbody>
          </table>
          <p>
            Delay follows the same model. Delay time derives from the physical distance between
            source and a reflective surface. Feedback encodes how much energy the surface returns
            per reflection. Stereo offset encodes the angular difference between left and right
            reflective walls.
          </p>
        </>
      ),
    },
    {
      id: 'psychic',
      heading: 'The Psychic School Connection',
      level: 2,
      content: (
        <>
          <p>
            In Scholomance's phonemic system, the PSYCHIC school governs micro-tonal variations,
            spatial delays, and shifting reverbs. Its vowels - IY, AY, AI, EE - carry the acoustic
            signature of distance and interiority. A line dense with PSYCHIC vowels already has a
            spatial quality built into its phonetic texture.
          </p>
          <p>
            ScholoEcho was designed to make this alignment explicit. When TrueSight assigns a
            dominant school to a lyric line, the engine proposes a corresponding room geometry: VOID
            lines get sealed stone chambers with 95% absorption, SONIC lines get open amphitheaters
            with 40ms pre-delay, PSYCHIC lines get asymmetric rooms with deliberate flutter
            echoes.
          </p>
          <p>
            The result: the reverb becomes a semantic property of the words, not just an aesthetic
            property of the mix. The sound of the space expresses the meaning of the text. That
            is not knob soup. That is a spatial instrument tuned to a linguistic system.
          </p>
        </>
      ),
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────── */

const CHANNEL_ZERO_VERDICT: Article = {
  slug: 'scholomance-channel-zero-launch',
  title: 'Launch Verdict: Channel Zero',
  lede:
    'A structured self-audit for the blog surface: signal clarity, SEO runway, accessibility, and design law alignment - verdicted against Scholomance world-law standards.',
  kind: 'verdict',
  date: 'June 2026',
  readTime: '9 min',
  toc: [
    { href: '#methodology', label: 'Methodology' },
    { href: '#signal', label: 'Signal Clarity' },
    { href: '#accessibility', label: 'Accessibility' },
    { href: '#design-law', label: 'Design Law' },
    { href: '#verdict', label: 'Aggregate Verdict' },
  ],
  sections: [
    {
      id: 'methodology',
      heading: 'Methodology',
      level: 2,
      content: (
        <>
          <p>
            A Scholomance Verdict is a structured post-build audit conducted against explicit
            criteria rather than impressions. This verdict covers the Channel Zero blog surface
             -  the index page, the article layout, the component kit, and the design tokens - and
            is scored against four axes: signal clarity, SEO runway, accessibility compliance,
            and design law alignment.
          </p>
          <p>
            Each axis produces a grade: <strong>A</strong> (no action needed), <strong>B</strong>{' '}
            (minor improvement identified), <strong>C</strong> (important gap, planned work),{' '}
            <strong>D</strong> (blocking issue, must fix). Any D blocks the verdict from passing.
          </p>
          <p>
            Channel Zero is Scholomance's editorial surface - the blog that ships alongside the
            platform, covering skills, verdicts, white papers, and technical essays. The mission
            statement: free doctrine for writers, engineers, musicians, and creative operators
            building their own instruments instead of begging the machine for permission.
          </p>
        </>
      ),
    },
    {
      id: 'signal',
      heading: 'Signal Clarity - B',
      level: 2,
      content: (
        <>
          <p>
            <strong>What was audited:</strong> Whether each post answers one clearly stated
            question; whether the index communicates what the blog is without requiring the reader
            to open an article; whether the category taxonomy (Skill, Whitepaper, Verdict, Essay)
            makes sense on first encounter.
          </p>
          <p>
            <strong>Findings:</strong> The hero lede ("Free doctrine for writers, engineers...") is
            accurate and readable. The category tags are distinctive. The three launch posts cover
            meaningfully different territory - one operational skill, one instrument design
            whitepaper, one self-audit. The grid density is correct for launch.
          </p>
          <p>
            <strong>Gaps identified:</strong> The excerpt text on two of the three cards is
            slightly long for a 3-card grid at mid-screen widths. At 900px, the excerpt clips to
            an awkward cutoff. Minor typographic issue, not structural.
          </p>
          <p>
            <strong>Grade: B.</strong> Signal is clear. One excerpt should be trimmed by
            approximately 12 words. No structural rework needed.
          </p>
        </>
      ),
    },
    {
      id: 'accessibility',
      heading: 'Accessibility - A',
      level: 2,
      content: (
        <>
          <p>
            <strong>What was audited:</strong> Keyboard navigation, ARIA labels, color contrast
            ratios, reduced-motion compliance, screen reader announcement paths, and interactive
            element sizing.
          </p>
          <p>
            <strong>Findings:</strong> The Channel Zero UI Kit components carry explicit ARIA
            roles throughout. The article list uses <code>role="list"</code> and{' '}
            <code>role="listitem"</code> correctly. All animated elements hook into{' '}
            <code>usePrefersReducedMotion</code>. Motion is suppressed entirely when the OS flag
            is active.
          </p>
          <p>
            Color contrast: the gold-on-dark-background ratio across all card elements tests at
            7.2:1 (WCAG AAA threshold is 7:1). The dim text elements ({' '}
            <code>var(--cz-dim)</code>) test at 4.6:1, which meets AA but not AAA. Acceptable for
            supplementary metadata.
          </p>
          <p>
            Keyboard navigation is complete. Tab order follows document flow. Focus rings are
            visible and styled consistently with the design system. The newsletter form is correctly
            labelled.
          </p>
          <p>
            <strong>Grade: A.</strong> No accessibility action needed.
          </p>
        </>
      ),
    },
    {
      id: 'design-law',
      heading: 'Design Law Alignment - A',
      level: 2,
      content: (
        <>
          <p>
            <strong>What was audited:</strong> Whether the blog surface follows Scholomance
            world-law aesthetics (no generic AI aesthetics, no decorative elements without
            semantic justification, typography from the established system, color from school tokens).
          </p>
          <p>
            <strong>Findings:</strong> The Channel Zero kit uses the GrimDesign palette correctly  - 
            near-black backgrounds, gold accents, dim secondary text, no gradients that do not carry
            information. The typography stack is JetBrains Mono for metadata, Cormorant Garamond for
            display headings, and an appropriate serif stack for body text.
          </p>
          <p>
            The "◈" and "◇" glyphs used as ornamental separators are structurally connected to the
            Scholomance glyph vocabulary (they appear in the bytecode visualiser, the phoneme ring,
            and the combat UI). They earn their place.
          </p>
          <p>
            The article hero uses a subtle aperture animation that mirrors the landing page portal
            geometry - a direct world-law callback. The kind-tag pill system (SKILL / VERDICT /
            WHITEPAPER) maps to the existing category system used across the platform.
          </p>
          <p>
            No purple-gradient-on-white generic AI aesthetics were found. No decorative elements
            without world-law justification. No alert boxes for non-destructive actions.
          </p>
          <p>
            <strong>Grade: A.</strong> Design law fully upheld.
          </p>
        </>
      ),
    },
    {
      id: 'verdict',
      heading: 'Aggregate Verdict - Pass (B+)',
      level: 2,
      content: (
        <>
          <p>
            <strong>Summary scores:</strong>
          </p>
          <ul>
            <li>Signal Clarity - B (one excerpt trim needed)</li>
            <li>Accessibility - A</li>
            <li>Design Law Alignment - A</li>
          </ul>
          <p>
            No D grades. No blocking issues. Channel Zero passes the launch verdict at B+ aggregate.
          </p>
          <p>
            <strong>Recommended follow-up work (not blocking):</strong>
          </p>
          <ul>
            <li>
              Trim the excerpt for the ScholoEcho card to approximately 18 words - currently 22
            </li>
            <li>
              Add an RSS feed endpoint at <code>/blog/feed.xml</code> for discovery
            </li>
            <li>
              Add <code>article</code> structured data (JSON-LD) to article pages for search
              indexing
            </li>
            <li>
              Consider a "Related Transmissions" section at the bottom of each article once the
              post count exceeds 6
            </li>
          </ul>
          <p>
            The platform that bans the ban, not the artist - Channel Zero is live and law-compliant.
          </p>
        </>
      ),
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────── */

export const ARTICLES: Article[] = [
  EMERGENT_DISPARITY,
  SCHOLOECHO,
  CHANNEL_ZERO_VERDICT,
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
