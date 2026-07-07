import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  restoreDefaults,
  getStorageStatus,
  slugify,
  ensureUniqueSlug,
  estimateReadTime,
} from '../../../src/pages/Blog/blogStore.js';
import { SEED_POSTS } from '../../../src/pages/Blog/seedPosts.js';

const POSTS_KEY = 'scholo:blog:posts';

beforeEach(() => {
  localStorage.clear();
});

describe('blogStore — seed merge', () => {
  it('returns the three seeds in order on fresh storage', () => {
    const posts = listPosts();
    expect(posts).toHaveLength(SEED_POSTS.length);
    expect(posts.map((p) => p.slug)).toEqual([
      'emergent-disparity-reconciliation-spell',
      'scholoecho-space-painting',
      'scholomance-channel-zero-launch',
    ]);
  });

  it('surfaces the featured seed first', () => {
    const posts = listPosts();
    expect(posts[0].featured).toBe(true);
  });

  it('gives every card an href derived from its slug', () => {
    const post = listPosts()[0];
    expect(post.href).toBe('/blog/emergent-disparity-reconciliation-spell');
  });

  it('orders newly created posts ahead of seeds', () => {
    createPost({ title: 'Fresh Transmission', excerpt: 'x', kind: 'essay', body: 'hello world' });
    const slugs = listPosts().map((p) => p.slug);
    // featured seed stays at index 0; the new post precedes the non-featured seeds
    expect(slugs.indexOf('fresh-transmission')).toBeLessThan(
      slugs.indexOf('scholoecho-space-painting')
    );
  });
});

describe('blogStore — getPost', () => {
  it('returns seed metadata tagged isSeed for a seed slug', () => {
    const post = getPost('scholoecho-space-painting');
    expect(post).toBeTruthy();
    expect(post.isSeed).toBe(true);
    expect(post.title).toBe('ScholoEcho and the Space-Painting Instrument');
  });

  it('returns null for an unknown slug', () => {
    expect(getPost('does-not-exist')).toBeNull();
  });

  it('returns a stored post (not seed) for a created slug', () => {
    const created = createPost({ title: 'My Post', excerpt: 'e', kind: 'essay', body: 'body text' });
    const fetched = getPost(created.slug);
    expect(fetched.isSeed).toBeFalsy();
    expect(fetched.body).toBe('body text');
  });
});

describe('blogStore — createPost', () => {
  it('assigns id, slug, dates and an estimated readTime', () => {
    const post = createPost({ title: 'Hello World', excerpt: 'e', kind: 'essay', body: 'one two three' });
    expect(post.id).toBeTruthy();
    expect(post.slug).toBe('hello-world');
    expect(post.createdAt).toBeTruthy();
    expect(post.updatedAt).toBeTruthy();
    expect(post.readTime).toMatch(/\d+ min/);
    expect(post.date).toBeTruthy();
  });

  it('suffixes colliding slugs -2, -3', () => {
    const a = createPost({ title: 'Same Title', excerpt: 'e', kind: 'essay', body: 'b' });
    const b = createPost({ title: 'Same Title', excerpt: 'e', kind: 'essay', body: 'b' });
    const c = createPost({ title: 'Same Title', excerpt: 'e', kind: 'essay', body: 'b' });
    expect(a.slug).toBe('same-title');
    expect(b.slug).toBe('same-title-2');
    expect(c.slug).toBe('same-title-3');
  });

  it('suffixes a slug that collides with a seed', () => {
    const post = createPost({
      title: 'Emergent Disparity Reconciliation Spell',
      excerpt: 'e',
      kind: 'essay',
      body: 'b',
    });
    expect(post.slug).toBe('emergent-disparity-reconciliation-spell-2');
  });
});

describe('blogStore — updatePost', () => {
  it('updates a stored post and bumps updatedAt', async () => {
    const created = createPost({ title: 'Original', excerpt: 'e', kind: 'essay', body: 'b' });
    await new Promise((r) => setTimeout(r, 2));
    const updated = updatePost(created.slug, { title: 'Edited', excerpt: 'e2' });
    expect(updated.title).toBe('Edited');
    expect(updated.excerpt).toBe('e2');
    expect(updated.slug).toBe(created.slug); // slug stays stable
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('creates a shadow when editing a seed slug', () => {
    const shadow = updatePost('scholoecho-space-painting', { body: 'rewritten body' });
    expect(shadow.shadowsSeed).toBe('scholoecho-space-painting');
    expect(shadow.slug).toBe('scholoecho-space-painting');
    // the shadow replaces the seed in the list (no duplicate)
    const occurrences = listPosts().filter((p) => p.slug === 'scholoecho-space-painting');
    expect(occurrences).toHaveLength(1);
    // getPost now returns the editable shadow, not the seed
    expect(getPost('scholoecho-space-painting').isSeed).toBeFalsy();
    expect(getPost('scholoecho-space-painting').body).toBe('rewritten body');
  });
});

describe('blogStore — deletePost', () => {
  it('removes a stored post', () => {
    const created = createPost({ title: 'Doomed', excerpt: 'e', kind: 'essay', body: 'b' });
    deletePost(created.slug);
    expect(getPost(created.slug)).toBeNull();
    expect(listPosts().some((p) => p.slug === created.slug)).toBe(false);
  });

  it('tombstones a seed so it is hidden from the index and routes', () => {
    deletePost('scholomance-channel-zero-launch');
    expect(getPost('scholomance-channel-zero-launch')).toBeNull();
    expect(listPosts().some((p) => p.slug === 'scholomance-channel-zero-launch')).toBe(false);
  });
});

describe('blogStore — restoreDefaults', () => {
  it('clears tombstones and shadows, returning seeds to original state', () => {
    deletePost('scholomance-channel-zero-launch');
    updatePost('scholoecho-space-painting', { body: 'rewritten' });
    restoreDefaults();
    const posts = listPosts();
    expect(posts).toHaveLength(SEED_POSTS.length);
    expect(getPost('scholoecho-space-painting').isSeed).toBe(true);
    expect(getPost('scholomance-channel-zero-launch')).toBeTruthy();
  });
});

describe('blogStore — helpers', () => {
  it('slugify normalizes to kebab-case', () => {
    expect(slugify('Hello, World! 2026')).toBe('hello-world-2026');
  });

  it('ensureUniqueSlug suffixes against a taken set', () => {
    expect(ensureUniqueSlug('post', ['post', 'post-2'])).toBe('post-3');
    expect(ensureUniqueSlug('post', [])).toBe('post');
  });

  it('estimateReadTime is word-count based, minimum 1 min', () => {
    expect(estimateReadTime('one two three')).toBe('1 min');
    const words = Array.from({ length: 400 }, () => 'word').join(' ');
    expect(estimateReadTime(words)).toBe('2 min');
    expect(estimateReadTime('')).toBe('1 min');
  });
});

describe('blogStore — resilience', () => {
  it('recovers from corrupt JSON: seeds still list, status flags corrupt', () => {
    localStorage.setItem(POSTS_KEY, '{not valid json');
    expect(listPosts()).toHaveLength(SEED_POSTS.length);
    expect(getStorageStatus().ok).toBe(false);
    expect(getStorageStatus().reason).toBe('corrupt');
  });

  it('falls back to read-only when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      expect(getStorageStatus().ok).toBe(false);
      expect(getStorageStatus().reason).toBe('unavailable');
      // reads still work (seeds)
      expect(listPosts()).toHaveLength(SEED_POSTS.length);
      // writes are refused gracefully, never throwing
      expect(createPost({ title: 'Nope', excerpt: 'e', kind: 'essay', body: 'b' })).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
