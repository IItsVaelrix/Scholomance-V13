import { GlyphButton } from './GlyphButton';

export type NewsletterSigilProps = {
  title?: string;
  description?: string;
};

// External subscribe provider -- the sole data controller. No email is ever
// captured, stored, or exported here; Damien sees no subscriber data.
const SUBSCRIBE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BLOG_SUBSCRIBE_URL) || '';

export function NewsletterSigil({
  title = 'Catch the next transmission',
  description = 'Essays, skills, postmortems, white papers, and the occasional artifact pried from the floorboards of the code cathedral.',
}: NewsletterSigilProps) {
  return (
    <section className="cz-newsletter" aria-labelledby="newsletter-title">
      <h2 id="newsletter-title">{title}</h2>
      <p>{description}</p>
      {SUBSCRIBE_URL ? (
        <>
          <GlyphButton href={SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer">
            Subscribe
          </GlyphButton>
          <p className="cz-newsletter__note">
            Subscriptions are handled by an external provider. Your email never touches this site.
          </p>
        </>
      ) : (
        <GlyphButton disabled aria-disabled="true" title="Subscriptions aren't configured yet (set VITE_BLOG_SUBSCRIBE_URL).">
          Subscribe
        </GlyphButton>
      )}
    </section>
  );
}
