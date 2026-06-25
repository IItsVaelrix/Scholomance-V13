# Functional Blog (Channel Zero) — Design

**Date:** 2026-06-25
**Status:** Approved design, pending spec review
**Author:** Damien + Claude

## 1. Goal

Make the Blog surface ("The Scholomance Channel: Zero") fully functional:

- Add, edit, and delete posts through the UI.
- Wire the dead sub-nav links (Skills / Whitepapers / Verdicts) so they do something.
- Make Subscribe work when clicked.

Constraint that shapes everything: **Damien must never see or hold private subscriber data.** This rules out collecting, storing, or exporting emails anywhere Damien controls. Subscribe therefore hands off to an external provider that is the sole data controller.

The work is **additive, not a redesign**. A normal visitor sees the page exactly as it looks today; editing controls appear for admins only.

## 2. Decisions (locked with user)

| Area | Decision |
| --- | --- |
| Post / state persistence | Browser `localStorage` (no backend). Matches existing app patterns (wand presets, bands). |
| Edit access | Admin only, via `useAuth()` + `isAdminUser(user)` (same gate `AdminRoute` uses). |
| Sub-nav links (Skills/Whitepapers/Verdicts) | Category **filters** on the index via `?kind=` query param (React Router `useSearchParams`). No new routes/pages. |
| Subscribe | Hands off to external provider URL from `VITE_BLOG_SUBSCRIBE_URL`. Damien stores/sees nothing. Unset → button disabled with tooltip. |
| Visual change | None for visitors. Existing components, styling, and the 3 hand-crafted articles are untouched. |

## 3. Content model (hybrid)

No markdown library or HTML sanitizer is installed, and the 3 existing articles in `src/pages/Blog/articles.tsx` are hand-authored rich JSX. We do not convert or destroy them.

- **Seed posts:** the existing 3 articles remain read-only source-of-truth content, rendered by the current JSX path (`getArticle()` in `articles.tsx`). Their list metadata continues to come from the hardcoded `posts[]` shape currently in `BlogIndexPage.tsx`, relocated into a seed module.
- **User posts:** posts created through the UI are stored in `localStorage` with a **plain-text body**, rendered by a small dependency-free, XSS-safe renderer (no `dangerouslySetInnerHTML`).
- **Lightweight text format** supported by the renderer:
  - `## heading` → `<h2>` (anchored, contributes to TOC)
  - `### heading` → `<h3>` (anchored, contributes to TOC)
  - blank-line-separated blocks → `<p>`
  - lines starting `- ` → `<ul><li>`
  - inline `**bold**` and `*italic*`
  - everything else is escaped text — no raw HTML is ever injected.

### Full CRUD over every post

- **User posts:** create / edit / delete directly.
- **Seed posts — edit:** "Edit" on a seed clones it into an editable localStorage post (a converted plain-text body) that **shadows** the seed (same slug). The original JSX seed is never mutated.
- **Seed posts — delete:** writes the slug into a **tombstone** list (`scholo:blog:hidden`) so the seed is hidden from the index/article routes. The seed JSX is never deleted.
- **Restore defaults:** an admin affordance clears overrides + tombstones, returning seeds to their original state.

## 4. Storage schema

`localStorage` keys (namespaced):

- `scholo:blog:posts` → JSON array of `StoredPost`:
  ```ts
  interface StoredPost {
    id: string;          // uuid-ish
    slug: string;        // unique; auto from title, collisions suffixed -2, -3...
    title: string;
    excerpt: string;
    kind: 'featured' | 'skill' | 'verdict' | 'essay' | 'whitepaper';
    featured?: boolean;
    date: string;        // human label, defaults to today
    readTime: string;    // e.g. "7 min", auto-estimated from body word count, editable
    body: string;        // lightweight-text source
    createdAt: string;   // ISO
    updatedAt: string;   // ISO
    shadowsSeed?: string;// present when this post overrides a seed slug
  }
  ```
- `scholo:blog:hidden` → JSON array of seed slugs to hide (tombstones).

The index list is the merge: `(seeds minus tombstones minus shadowed) ++ storedPosts`, ordered with newest/`updatedAt` first, `featured` surfaced to the hero slot as today.

## 5. Units (each small, single-purpose)

1. **`src/pages/Blog/blogStore.js`** — pure module, the only thing that touches `localStorage`. API:
   - `listPosts()` → merged, ordered list of card metadata.
   - `getPost(slug)` → stored post, or seed fallback, or `null`.
   - `createPost(data)` → assigns id/slug/dates/readTime, persists, returns post.
   - `updatePost(slug, data)` → updates a stored post, or creates a shadow for a seed slug.
   - `deletePost(slug)` → removes a stored post, or tombstones a seed.
   - `restoreDefaults()` → clears tombstones + seed shadows.
   - Helpers: `slugify()`, `ensureUniqueSlug()`, `estimateReadTime()`.
   - Degrades gracefully: storage unavailable / quota / corrupt JSON → in-memory read-only with a surfaced notice; never throws into render.
2. **`src/pages/Blog/seedPosts.js`** — the 3 existing posts' card metadata as data (moved out of `BlogIndexPage.tsx`), each tagged `isSeed: true` and pointing at the existing `articles.tsx` content via slug.
3. **`src/pages/Blog/MarkdownLite.tsx`** — renders the lightweight-text body to safe React nodes and exposes a `extractToc(body)` for the article TOC. No `dangerouslySetInnerHTML`.
4. **`src/pages/Blog/PostEditor.tsx`** — admin create/edit form: title, excerpt, kind (select), featured (toggle), body (textarea). Slug, date, and read-time auto-derived (read-time editable). Validates required fields; cancel/save.
5. **`src/pages/Blog/BlogIndexPage.tsx`** (modified) — reads from `blogStore`, applies `?kind` filter from `useSearchParams`, renders the same layout; for admins shows a "New transmission" button and per-card Edit/Delete. Empty-filter state shows a friendly message.
6. **`src/pages/Blog/ArticlePage.tsx`** (modified) — resolves via `blogStore.getPost(slug)`; stored posts render through `MarkdownLite` (+ its TOC), seeds keep the existing JSX renderer; admins get Edit/Delete actions.
7. **`src/kits/channel-zero-ui-kit/components/ChannelHeader.tsx`** (modified) — nav items become category filter links using React Router `Link` to `/blog?kind=...` (with active-state highlight); Subscribe opens `VITE_BLOG_SUBSCRIBE_URL` in a new tab, disabled with tooltip when unset.
8. **`src/kits/channel-zero-ui-kit/components/NewsletterSigil.tsx`** (modified) — Subscribe handoff to the external URL instead of `POST /subscribe`; no email is captured or stored.
9. **`./.env.example`** (repo-root, the Vite-facing env file alongside the other `VITE_*` vars) — document `VITE_BLOG_SUBSCRIBE_URL`.

## 6. Routing / navigation

- App uses React Router v7 `createBrowserRouter`. `/blog` and `/blog/:slug` already registered.
- Filters use `useSearchParams` so `/blog?kind=skill` re-renders in place (no full reload). Sub-nav links switch from raw `<a href>` (full reload) to `Link`.
- "Subscribe" is an external navigation (`window.open` / anchor with `target="_blank" rel="noopener noreferrer"`), not an in-app route.

## 7. Error handling & edge cases

- `localStorage` unavailable / quota exceeded / corrupt JSON → `blogStore` falls back to in-memory read-only and surfaces a non-blocking notice; editing disabled in that state.
- Duplicate slug on create/shadow → auto-suffixed (`-2`, `-3`, ...).
- Non-admins: edit controls never render; the editor route/affordance is unreachable.
- `kind` query value not in the known set → treated as "all".
- Empty filter result → "No transmissions in this band yet."
- `VITE_BLOG_SUBSCRIBE_URL` unset → Subscribe disabled with explanatory tooltip (no broken navigation).

## 8. Testing

Test-first (TDD) where it has logic:

- **`blogStore`** unit tests: create/get/update/delete; seed merge; tombstone hide + restore; seed shadow-on-edit; slug collision suffixing; read-time estimate; corrupt-JSON recovery; storage-unavailable fallback.
- **`MarkdownLite`** unit tests: heading→TOC extraction + anchors; paragraph/list/bold/italic rendering; XSS attempt (e.g. `<script>` / `<img onerror>`) is escaped, never executed.
- Manual verification: admin create→appears on index→open article→edit→delete→restore defaults; non-admin sees no controls; filters via sub-nav; Subscribe opens external URL (and is disabled when unset).

## 9. Out of scope (YAGNI)

- Backend/server persistence, multi-device sync.
- Real email collection, double opt-in, or any subscriber storage Damien controls.
- Rich WYSIWYG editor, image uploads, comments, drafts/scheduling.
- New `/skills`, `/whitepapers`, `/verdicts` standalone pages.
- Visual redesign of the Channel Zero surface.
