/**
 * blogStore — the only module that touches localStorage for the blog surface.
 *
 * It merges the three read-only seed posts (see `seedPosts.js`) with
 * user-created posts, honouring:
 *   - tombstones  (`scholo:blog:hidden`) → seeds hidden from index/routes
 *   - shadows     (a stored post whose `shadowsSeed` equals a seed slug)
 *
 * Design constraints:
 *   - Pure data in / data out; no React, no DOM beyond localStorage.
 *   - Never throws into render. Storage unavailable / quota / corrupt JSON
 *     degrade to in-memory read-only with a surfaced status.
 */

import { SEED_POSTS } from './seedPosts.js';

const POSTS_KEY = 'scholo:blog:posts';
const HIDDEN_KEY = 'scholo:blog:hidden';
const PROBE_KEY = '__scholo_blog_probe__';

const KNOWN_KINDS = ['featured', 'skill', 'verdict', 'essay', 'whitepaper'];

/* ── storage primitives (defensive) ─────────────────────────────────── */

function rawStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Returns a usable Storage, or null if reads/writes are not possible. */
function safeStorage() {
  const ls = rawStorage();
  if (!ls) return null;
  try {
    ls.setItem(PROBE_KEY, '1');
    ls.removeItem(PROBE_KEY);
    return ls;
  } catch {
    return null;
  }
}

function readArray(key) {
  const ls = rawStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  const ls = safeStorage();
  if (!ls) return false;
  try {
    ls.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reports whether persistent storage is healthy.
 * `{ ok: true }` | `{ ok: false, reason: 'unavailable' | 'corrupt' }`
 */
export function getStorageStatus() {
  if (!safeStorage()) return { ok: false, reason: 'unavailable' };
  const ls = rawStorage();
  for (const key of [POSTS_KEY, HIDDEN_KEY]) {
    try {
      const raw = ls.getItem(key);
      if (raw) JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'corrupt' };
    }
  }
  return { ok: true };
}

/* ── helpers ─────────────────────────────────────────────────────────── */

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ensureUniqueSlug(base, taken) {
  const takenSet = new Set(taken);
  const root = base || 'post';
  if (!takenSet.has(root)) return root;
  let n = 2;
  while (takenSet.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function estimateReadTime(body) {
  const words = String(body || '').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min`;
}

function todayLabel() {
  try {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function newId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `post-${Date.now().toString(36)}-${crypto.randomUUID().split('-')[0]}`;
}

function normalizeKind(kind) {
  return KNOWN_KINDS.includes(kind) ? kind : 'essay';
}

/* ── card projection + ordering ──────────────────────────────────────── */

function storedSortTs(post) {
  const t = Date.parse(post.updatedAt || post.createdAt || '');
  return Number.isNaN(t) ? 0 : t;
}

function storedToCard(post) {
  return {
    slug: post.slug,
    href: `/blog/${post.slug}`,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category || kindLabel(post.kind),
    kind: post.kind,
    date: post.date,
    readTime: post.readTime,
    featured: Boolean(post.featured),
    isSeed: false,
    _sortTs: storedSortTs(post),
  };
}

function seedToCard(seed, index) {
  return {
    slug: seed.slug,
    href: `/blog/${seed.slug}`,
    title: seed.title,
    excerpt: seed.excerpt,
    category: seed.category,
    kind: seed.kind,
    date: seed.date,
    readTime: seed.readTime,
    featured: Boolean(seed.featured),
    isSeed: true,
    // Seeds sort below freshly created posts but keep declaration order
    // amongst themselves (earlier = "newer" so index 0 stays on top).
    _sortTs: -index - 1,
  };
}

function kindLabel(kind) {
  if (!kind) return '';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function orderCards(cards) {
  return [...cards].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return b._sortTs - a._sortTs;
  });
}

/* ── public API ──────────────────────────────────────────────────────── */

export function listPosts() {
  const stored = readArray(POSTS_KEY);
  const hidden = new Set(readArray(HIDDEN_KEY));
  const shadowed = new Set(
    stored.filter((p) => p && p.shadowsSeed).map((p) => p.shadowsSeed)
  );

  const visibleSeeds = SEED_POSTS.filter(
    (s) => !hidden.has(s.slug) && !shadowed.has(s.slug)
  );

  const cards = [
    ...stored.filter(Boolean).map(storedToCard),
    ...visibleSeeds.map((s) => seedToCard(s, SEED_POSTS.indexOf(s))),
  ];

  return orderCards(cards).map(({ _sortTs, ...card }) => card);
}

export function getPost(slug) {
  if (!slug) return null;
  const stored = readArray(POSTS_KEY);
  const match = stored.find((p) => p && p.slug === slug);
  if (match) return { ...match, isSeed: false };

  const hidden = new Set(readArray(HIDDEN_KEY));
  if (hidden.has(slug)) return null;

  const seed = SEED_POSTS.find((s) => s.slug === slug);
  if (seed) return { ...seed, isSeed: true };

  return null;
}

function takenSlugs(stored) {
  return [...stored.map((p) => p.slug), ...SEED_POSTS.map((s) => s.slug)];
}

export function createPost(data = {}) {
  if (!safeStorage()) return null;
  const stored = readArray(POSTS_KEY);
  const slug = ensureUniqueSlug(slugify(data.title), takenSlugs(stored));
  const now = new Date().toISOString();
  const body = data.body || '';
  const kind = normalizeKind(data.kind);

  const post = {
    id: newId(),
    slug,
    title: data.title || 'Untitled transmission',
    excerpt: data.excerpt || '',
    kind,
    category: data.category || kindLabel(kind),
    featured: Boolean(data.featured),
    date: data.date || todayLabel(),
    readTime: data.readTime || estimateReadTime(body),
    body,
    createdAt: now,
    updatedAt: now,
  };

  if (!writeArray(POSTS_KEY, [...stored, post])) return null;
  return post;
}

export function updatePost(slug, data = {}) {
  if (!safeStorage()) return null;
  const stored = readArray(POSTS_KEY);
  const idx = stored.findIndex((p) => p && p.slug === slug);
  const now = new Date().toISOString();

  if (idx !== -1) {
    const prev = stored[idx];
    const body = data.body != null ? data.body : prev.body;
    const next = {
      ...prev,
      ...data,
      slug: prev.slug, // slug stays stable across edits
      kind: data.kind ? normalizeKind(data.kind) : prev.kind,
      body,
      readTime: data.readTime || estimateReadTime(body),
      updatedAt: now,
    };
    const copy = [...stored];
    copy[idx] = next;
    if (!writeArray(POSTS_KEY, copy)) return null;
    return next;
  }

  // No stored post — if the slug is a seed, shadow it into an editable post.
  const seed = SEED_POSTS.find((s) => s.slug === slug);
  if (!seed) return null;

  const shadowBody = data.body != null ? data.body : '';
  const shadowKind = data.kind ? normalizeKind(data.kind) : seed.kind;
  const shadow = {
    id: newId(),
    slug: seed.slug,
    title: data.title || seed.title,
    excerpt: data.excerpt || seed.excerpt,
    kind: shadowKind,
    category: data.category || seed.category,
    featured: data.featured != null ? Boolean(data.featured) : Boolean(seed.featured),
    date: data.date || seed.date,
    readTime: data.readTime || estimateReadTime(shadowBody),
    body: shadowBody,
    createdAt: now,
    updatedAt: now,
    shadowsSeed: seed.slug,
  };
  if (!writeArray(POSTS_KEY, [...stored, shadow])) return null;
  return shadow;
}

export function deletePost(slug) {
  if (!safeStorage()) return false;
  const stored = readArray(POSTS_KEY);
  const match = stored.find((p) => p && p.slug === slug);

  if (match) {
    const remaining = stored.filter((p) => p.slug !== slug);
    let ok = writeArray(POSTS_KEY, remaining);
    // Deleting a shadow should also retire the underlying seed.
    if (match.shadowsSeed) ok = tombstone(match.shadowsSeed) && ok;
    return ok;
  }

  // Not a stored post — tombstone it if it's a (visible) seed.
  if (SEED_POSTS.some((s) => s.slug === slug)) return tombstone(slug);
  return false;
}

function tombstone(slug) {
  const hidden = readArray(HIDDEN_KEY);
  if (hidden.includes(slug)) return true;
  return writeArray(HIDDEN_KEY, [...hidden, slug]);
}

export function restoreDefaults() {
  if (!safeStorage()) return false;
  const stored = readArray(POSTS_KEY).filter((p) => p && !p.shadowsSeed);
  const a = writeArray(POSTS_KEY, stored);
  const b = writeArray(HIDDEN_KEY, []);
  return a && b;
}

export { KNOWN_KINDS };
