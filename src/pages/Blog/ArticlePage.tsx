import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChannelHeader } from '../../kits/channel-zero-ui-kit/components/ChannelHeader';
import { ChannelShell } from '../../kits/channel-zero-ui-kit/components/ChannelShell';
import { NewsletterSigil } from '../../kits/channel-zero-ui-kit/components/NewsletterSigil';
import { SignalTag } from '../../kits/channel-zero-ui-kit/components/SignalTag';
import type { SignalKind } from '../../kits/channel-zero-ui-kit/components/SignalTag';
import { TableOfContents } from '../../kits/channel-zero-ui-kit/components/TableOfContents';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { isAdminUser } from '../../lib/admin.js';
import { getArticle, seedArticleToBody, type Article } from './articles';
import { getPost, updatePost, deletePost, getStorageStatus } from './blogStore.js';
import { MarkdownLite, extractToc } from './MarkdownLite';
import { PostEditor, type PostEditorValues } from './PostEditor';
import './channel-zero-grim.css';

const KIND_LABEL: Record<string, string> = {
  skill: 'Skill',
  whitepaper: 'Whitepaper',
  verdict: 'Verdict',
  essay: 'Essay',
  featured: 'Featured',
};

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const storageStatus = getStorageStatus();

  const [version, setVersion] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);

  // `version` is an intentional cache-bust so the post re-resolves after edit/delete.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const post = useMemo(() => (slug ? getPost(slug) : null), [slug, version]);
  const isSeed = Boolean(post?.isSeed);
  const seedArticle: Article | undefined = isSeed && slug ? getArticle(slug) : undefined;

  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!seedArticle) return;
    const timer = setTimeout(() => {
      setVisibleSections(new Set(seedArticle.sections.map((s) => s.id)));
    }, prefersReducedMotion ? 0 : 600);
    return () => clearTimeout(timer);
  }, [seedArticle, prefersReducedMotion]);

  const editorInitial = useMemo(() => {
    if (!post) return null;
    return {
      title: post.title,
      excerpt: post.excerpt,
      kind: post.kind,
      featured: Boolean(post.featured),
      // Seeds: flatten the JSX into editable lightweight text. Stored: use body.
      body: isSeed && slug ? seedArticleToBody(slug) : ('body' in post ? (post.body as string) ?? '' : ''),
      readTime: post.readTime,
    };
  }, [post, isSeed, slug]);

  const handleSave = useCallback(
    (values: PostEditorValues) => {
      if (!slug) return;
      updatePost(slug, values);
      setEditorOpen(false);
      setVersion((v) => v + 1);
    },
    [slug]
  );

  const handleDelete = useCallback(() => {
    if (!slug || !post) return;
    if (window.confirm(`Delete "${post.title}"? This hides it from the channel.`)) {
      deletePost(slug);
      navigate('/blog');
    }
  }, [slug, post, navigate]);

  const adminBar =
    isAdmin && storageStatus.ok ? (
      <div className="cz-article-admin">
        <button className="cz-mini-button" onClick={() => setEditorOpen(true)}>
          Edit
        </button>
        <button className="cz-mini-button cz-mini-button--danger" onClick={handleDelete}>
          Delete
        </button>
      </div>
    ) : null;

  const editorOverlay =
    editorOpen && storageStatus.ok ? (
      <PostEditor
        mode="edit"
        initial={editorInitial}
        onSave={handleSave}
        onCancel={() => setEditorOpen(false)}
      />
    ) : null;

  // ── Not found ──────────────────────────────────────────────────────────
  if (!post || (isSeed && !seedArticle)) {
    return (
      <ChannelShell>
        <ChannelHeader />
        <main className="cz-page cz-layout-article cz-grim">
          <article className="cz-article">
            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
            >
              Transmission Not Found
            </motion.h1>
            <p className="cz-article-lede">
              The signal at <code>{slug}</code> does not exist in the archive.
            </p>
          </article>
        </main>
      </ChannelShell>
    );
  }

  // ── Seed article (rich hand-authored JSX) ──────────────────────────────
  if (seedArticle) {
    const article = seedArticle;
    return (
      <ChannelShell>
        <ChannelHeader />
        <main className="cz-page cz-layout-article cz-grim">
          <article className="cz-article">
            {adminBar}
            <SignalTag kind={article.kind as SignalKind}>
              {KIND_LABEL[article.kind] ?? article.kind}
            </SignalTag>
            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {article.title}
            </motion.h1>
            <motion.p
              className="cz-article-lede"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.5,
                delay: prefersReducedMotion ? 0 : 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {article.lede}
            </motion.p>

            <AnimatePresence>
              {article.sections.map((section, index) => (
                <motion.section
                  key={section.id}
                  id={section.id}
                  className="cz-article-section"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                  animate={
                    visibleSections.has(section.id)
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: 24 }
                  }
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.5,
                    ease: [0.16, 1, 0.3, 1],
                    delay: prefersReducedMotion ? 0 : index * 0.1 + 0.2,
                  }}
                >
                  {section.level === 2 ? (
                    <motion.h2
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 0.4,
                        delay: prefersReducedMotion ? 0 : 0.05,
                      }}
                    >
                      {section.heading}
                    </motion.h2>
                  ) : (
                    <motion.h3
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 0.3,
                        delay: prefersReducedMotion ? 0 : 0.05,
                      }}
                    >
                      {section.heading}
                    </motion.h3>
                  )}
                  {section.content}
                </motion.section>
              ))}
            </AnimatePresence>

            <motion.section
              className="cz-article-newsletter"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.5,
                delay: prefersReducedMotion ? 0 : 0.3,
              }}
            >
              <NewsletterSigil />
            </motion.section>
          </article>

          <motion.aside
            className="cz-toc-wrapper"
            initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.5,
              delay: prefersReducedMotion ? 0 : 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <TableOfContents items={article.toc} />
          </motion.aside>
        </main>
        {editorOverlay}
      </ChannelShell>
    );
  }

  // ── Stored post (lightweight-text body via MarkdownLite) ───────────────
  const body = ('body' in post ? (post.body as string) : '') ?? '';
  const toc = extractToc(body);
  return (
    <ChannelShell>
      <ChannelHeader />
      <main className="cz-page cz-layout-article cz-grim">
        <article className="cz-article">
          {adminBar}
          <SignalTag kind={post.kind as SignalKind}>
            {KIND_LABEL[post.kind] ?? post.kind}
          </SignalTag>
          <motion.h1
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {post.title}
          </motion.h1>
          {post.excerpt && (
            <motion.p
              className="cz-article-lede"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }}
            >
              {post.excerpt}
            </motion.p>
          )}

          <div className="cz-article-body cz-article-section">
            <MarkdownLite body={body} />
          </div>

          <section className="cz-article-newsletter">
            <NewsletterSigil />
          </section>
        </article>

        {toc.length > 0 && (
          <aside className="cz-toc-wrapper">
            <TableOfContents items={toc} />
          </aside>
        )}
      </main>
      {editorOverlay}
    </ChannelShell>
  );
}
