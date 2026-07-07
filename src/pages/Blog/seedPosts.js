/**
 * Seed posts — card metadata for the three hand-authored launch articles.
 *
 * These are the read-only source-of-truth posts. Their rich JSX bodies live in
 * `articles.tsx` (resolved by slug via `getArticle`); this module only carries
 * the list/card metadata that used to be hardcoded in `BlogIndexPage.tsx`.
 *
 * Each entry is tagged `isSeed: true`. The blog store merges these with
 * user-created posts, honouring tombstones (hidden seeds) and shadows
 * (seeds edited into editable localStorage posts).
 */

export const SEED_POSTS = [
  {
    slug: 'emergent-disparity-reconciliation-spell',
    title: 'Emergent Disparity Reconciliation Spell',
    excerpt:
      'A method for scanning a codebase for connective tissue hidden between systems, then proposing upgrades with low regression blast radius.',
    category: 'Skill',
    kind: 'skill',
    date: 'June 10, 2026',
    readTime: '7 min',
    featured: true,
    isSeed: true,
  },
  {
    slug: 'scholoecho-space-painting',
    title: 'ScholoEcho and the Space-Painting Instrument',
    excerpt:
      'A blog-native white paper on designing reverb and delay as spatial paint instead of knob soup.',
    category: 'Whitepaper',
    kind: 'whitepaper',
    date: 'June 2026',
    readTime: '12 min',
    featured: false,
    isSeed: true,
  },
  {
    slug: 'scholomance-channel-zero-launch',
    title: 'Launch Verdict: Channel Zero',
    excerpt:
      'A structured self-audit for the blog surface: signal clarity, SEO runway, accessibility, and design law alignment.',
    category: 'Verdict',
    kind: 'verdict',
    date: 'June 2026',
    readTime: '9 min',
    featured: false,
    isSeed: true,
  },
];

export function getSeedPost(slug) {
  return SEED_POSTS.find((s) => s.slug === slug) || null;
}
