import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArticleCard } from '../../kits/channel-zero-ui-kit/components/ArticleCard';
import { ArticleHero } from '../../kits/channel-zero-ui-kit/components/ArticleHero';
import { ChannelHeader } from '../../kits/channel-zero-ui-kit/components/ChannelHeader';
import { ChannelShell } from '../../kits/channel-zero-ui-kit/components/ChannelShell';
import { NewsletterSigil } from '../../kits/channel-zero-ui-kit/components/NewsletterSigil';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { isAdminUser } from '../../lib/admin.js';
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  restoreDefaults,
  getStorageStatus,
  KNOWN_KINDS,
} from './blogStore.js';
import { PostEditor, type PostEditorValues } from './PostEditor';
import './channel-zero-grim.css';

const KIND_LABELS: Record<string, string> = {
  featured: 'FEATURED',
  skill: 'SKILL',
  verdict: 'VERDICT',
  essay: 'ESSAY',
  whitepaper: 'WHITEPAPER',
};

const BAND_LABELS: Record<string, string> = {
  skill: 'Skills',
  whitepaper: 'White Papers',
  verdict: 'Verdicts',
  essay: 'Essays',
  featured: 'Featured',
};

type EditorState = { mode: 'new' } | { mode: 'edit'; slug: string } | null;

export default function BlogIndexPage() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);

  const [isLoaded, setIsLoaded] = useState(false);
  const [allPosts, setAllPosts] = useState(() => listPosts());
  const [editor, setEditor] = useState<EditorState>(null);
  const storageStatus = getStorageStatus();

  const refresh = useCallback(() => setAllPosts(listPosts()), []);

  // Category filter from ?kind=. Unknown values fall back to "all".
  const kindParam = searchParams.get('kind');
  const activeKind = kindParam && KNOWN_KINDS.includes(kindParam) ? kindParam : null;

  const filteredPosts = useMemo(
    () => (activeKind ? allPosts.filter((p) => p.kind === activeKind) : allPosts),
    [allPosts, activeKind]
  );

  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), prefersReducedMotion ? 0 : 100);
    return () => clearTimeout(timer);
  }, [prefersReducedMotion]);

  // Reveal (staggered) up to the filtered length; reset when the filter changes.
  useEffect(() => {
    if (!isLoaded) return;
    setVisibleCount(0);
    const timer = setTimeout(
      () => setVisibleCount(filteredPosts.length),
      prefersReducedMotion ? 0 : 300
    );
    return () => clearTimeout(timer);
  }, [isLoaded, prefersReducedMotion, filteredPosts.length, activeKind]);

  const visiblePosts = filteredPosts.slice(0, visibleCount);

  const editorInitial = useMemo(() => {
    if (editor?.mode !== 'edit') return null;
    const post = getPost(editor.slug);
    if (!post) return null;
    return {
      title: post.title,
      excerpt: post.excerpt,
      kind: post.kind,
      featured: Boolean(post.featured),
      body: 'body' in post ? (post.body as string) ?? '' : '',
      readTime: post.readTime,
    };
  }, [editor]);

  const handleSave = useCallback(
    (values: PostEditorValues) => {
      if (editor?.mode === 'edit') {
        updatePost(editor.slug, values);
      } else {
        createPost(values);
      }
      setEditor(null);
      refresh();
    },
    [editor, refresh]
  );

  const handleDelete = useCallback(
    (slug: string, title: string) => {
      // Destructive action → confirm. Seeds are tombstoned (never destroyed).
      if (window.confirm(`Delete "${title}"? This hides it from the channel.`)) {
        deletePost(slug);
        refresh();
      }
    },
    [refresh]
  );

  const handleRestore = useCallback(() => {
    if (window.confirm('Restore all default transmissions and discard edits/hides of seed posts?')) {
      restoreDefaults();
      refresh();
    }
  }, [refresh]);

  const bandName = activeKind ? BAND_LABELS[activeKind] ?? 'Transmissions' : 'Latest Transmissions';

  return (
    <ChannelShell>
      <ChannelHeader />
      <main className="cz-page cz-grim">
        <ArticleHero
          aperture
          title="The Scholomance Channel: Zero"
          lede="Free doctrine for writers, engineers, musicians, and creative operators building their own instruments instead of begging the machine for permission."
        />

        {isAdmin && !storageStatus.ok && (
          <p className="cz-storage-notice" role="status">
            ◇ Local storage is {storageStatus.reason}. Editing is disabled; showing default
            transmissions in read-only mode.
          </p>
        )}

        <section aria-labelledby="latest-transmissions">
          <div className="cz-section-head">
            <div>
              <h2 id="latest-transmissions">{bandName}</h2>
              <p>Skills, postmortems, white papers, and verdicts from the creative operating system.</p>
            </div>
            {isAdmin && storageStatus.ok && (
              <div className="cz-admin-bar">
                <button className="cz-button" onClick={() => setEditor({ mode: 'new' })}>
                  ◇ New transmission
                </button>
                <button className="cz-button" data-variant="ghost" onClick={handleRestore}>
                  Restore defaults
                </button>
              </div>
            )}
          </div>

          {filteredPosts.length === 0 ? (
            <p className="cz-empty-band">No transmissions in this band yet.</p>
          ) : (
            <AnimatePresence>
              <div className="cz-grid" role="list" aria-label="Blog posts">
                {visiblePosts.map((post, index) => (
                  <motion.article
                    key={post.slug}
                    role="listitem"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.4,
                      ease: [0.16, 1, 0.3, 1],
                      delay: prefersReducedMotion ? 0 : index * 0.08,
                    }}
                  >
                    <ArticleCard {...post} />
                    <span
                      className="cz-card-kind"
                      style={{ '--tag-color': `var(--cz-${post.kind})` } as React.CSSProperties}
                    >
                      {KIND_LABELS[post.kind] ?? post.kind.toUpperCase()}
                    </span>
                    {isAdmin && storageStatus.ok && (
                      <div className="cz-card-admin">
                        <button
                          className="cz-mini-button"
                          onClick={() => setEditor({ mode: 'edit', slug: post.slug })}
                        >
                          Edit
                        </button>
                        <button
                          className="cz-mini-button cz-mini-button--danger"
                          onClick={() => handleDelete(post.slug, post.title)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </motion.article>
                ))}
              </div>
            </AnimatePresence>
          )}

          {filteredPosts.length > 0 && (
            <motion.div
              className="cz-load-more"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: visibleCount < filteredPosts.length ? 1 : 0, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.2 }}
            >
              {visibleCount < filteredPosts.length && (
                <button
                  className="cz-button"
                  onClick={() => setVisibleCount((prev) => Math.min(prev + 3, filteredPosts.length))}
                >
                  Load more transmissions
                </button>
              )}
              {visibleCount >= filteredPosts.length && (
                <p className="cz-end-marker">
                  <span aria-hidden="true">◇</span>
                  End of current transmissions
                  <span aria-hidden="true">◇</span>
                </p>
              )}
            </motion.div>
          )}
        </section>

        <NewsletterSigil />
      </main>

      {editor && storageStatus.ok && (
        <PostEditor
          mode={editor.mode}
          initial={editorInitial}
          onSave={handleSave}
          onCancel={() => setEditor(null)}
        />
      )}
    </ChannelShell>
  );
}
