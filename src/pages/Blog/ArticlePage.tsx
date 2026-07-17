import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChannelHeader } from '../../kits/channel-zero-ui-kit/components/ChannelHeader';
import { ChannelShell } from '../../kits/channel-zero-ui-kit/components/ChannelShell';
import { NewsletterSigil } from '../../kits/channel-zero-ui-kit/components/NewsletterSigil';
import { SignalTag } from '../../kits/channel-zero-ui-kit/components/SignalTag';
import type { SignalKind } from '../../kits/channel-zero-ui-kit/components/SignalTag';
import { TableOfContents } from '../../kits/channel-zero-ui-kit/components/TableOfContents';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { getArticle } from './articles';
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
  const article = slug ? getArticle(slug) : undefined;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!article) return;
    const timer = setTimeout(() => {
      setVisibleSections(new Set(article.sections.map((s) => s.id)));
    }, prefersReducedMotion ? 0 : 600);
    return () => clearTimeout(timer);
  }, [article, prefersReducedMotion]);

  if (!article) {
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

  return (
    <ChannelShell>
      <ChannelHeader />
      <main className="cz-page cz-layout-article cz-grim">
        <article className="cz-article">
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
    </ChannelShell>
  );
}
