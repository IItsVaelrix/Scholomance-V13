import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArticleCard } from '../../kits/channel-zero-ui-kit/components/ArticleCard';
import { ArticleHero } from '../../kits/channel-zero-ui-kit/components/ArticleHero';
import { ChannelHeader } from '../../kits/channel-zero-ui-kit/components/ChannelHeader';
import { ChannelShell } from '../../kits/channel-zero-ui-kit/components/ChannelShell';
import { NewsletterSigil } from '../../kits/channel-zero-ui-kit/components/NewsletterSigil';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import './channel-zero-grim.css';

interface BlogPost {
  href: string;
  title: string;
  excerpt: string;
  category: string;
  kind: 'featured' | 'skill' | 'verdict' | 'essay' | 'whitepaper';
  date: string;
  readTime: string;
  featured?: boolean;
}

const posts: BlogPost[] = [
  {
    href: '/blog/emergent-disparity-reconciliation-spell',
    title: 'Emergent Disparity Reconciliation Spell',
    excerpt: 'A method for scanning a codebase for connective tissue hidden between systems, then proposing upgrades with low regression blast radius.',
    category: 'Skill',
    kind: 'skill',
    date: 'June 10, 2026',
    readTime: '7 min',
    featured: true,
  },
  {
    href: '/blog/scholoecho-space-painting',
    title: 'ScholoEcho and the Space-Painting Instrument',
    excerpt: 'A blog-native white paper on designing reverb and delay as spatial paint instead of knob soup.',
    category: 'Whitepaper',
    kind: 'whitepaper',
    date: 'June 2026',
    readTime: '12 min',
  },
  {
    href: '/blog/scholomance-channel-zero-launch',
    title: 'Launch Verdict: Channel Zero',
    excerpt: 'A structured self-audit for the blog surface: signal clarity, SEO runway, accessibility, and design law alignment.',
    category: 'Verdict',
    kind: 'verdict',
    date: 'June 2026',
    readTime: '9 min',
  },
];

const KIND_LABELS: Record<BlogPost['kind'], string> = {
  featured: 'FEATURED',
  skill: 'SKILL',
  verdict: 'VERDICT',
  essay: 'ESSAY',
  whitepaper: 'WHITEPAPER',
};

export default function BlogIndexPage() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isLoaded, setIsLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), prefersReducedMotion ? 0 : 100);
    return () => clearTimeout(timer);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => setVisibleCount(posts.length), prefersReducedMotion ? 0 : 300);
    return () => clearTimeout(timer);
  }, [isLoaded, prefersReducedMotion]);

  const visiblePosts = posts.slice(0, visibleCount);

  return (
    <ChannelShell>
      <ChannelHeader />
      <main className="cz-page cz-grim">
        <ArticleHero
          aperture
          title="The Scholomance Channel: Zero"
          lede="Free doctrine for writers, engineers, musicians, and creative operators building their own instruments instead of begging the machine for permission."
        />

        <section aria-labelledby="latest-transmissions">
          <div className="cz-section-head">
            <h2 id="latest-transmissions">Latest Transmissions</h2>
            <p>Skills, postmortems, white papers, and verdicts from the creative operating system.</p>
          </div>

          <AnimatePresence>
            <div className="cz-grid" role="list" aria-label="Blog posts">
              {visiblePosts.map((post, index) => (
                <motion.article
                  key={post.href}
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
                    {KIND_LABELS[post.kind]}
                  </span>
                </motion.article>
              ))}
            </div>
          </AnimatePresence>

          <motion.div
            className="cz-load-more"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: visibleCount < posts.length ? 1 : 0, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.2 }}
          >
            {visibleCount < posts.length && (
              <button
                className="cz-button"
                onClick={() => setVisibleCount(prev => Math.min(prev + 3, posts.length))}
              >
                Load more transmissions
              </button>
            )}
            {visibleCount >= posts.length && (
              <p className="cz-end-marker">
                <span aria-hidden="true">◇</span>
                End of current transmissions
                <span aria-hidden="true">◇</span>
              </p>
            )}
          </motion.div>
        </section>

        <NewsletterSigil />
      </main>
    </ChannelShell>
  );
}