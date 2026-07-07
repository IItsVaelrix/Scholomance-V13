import { GlyphButton } from './GlyphButton';

export type NewsletterSigilProps = {
  title?: string;
  description?: string;
};

export function NewsletterSigil({
  title = 'Catch the next transmission',
  description = 'Essays, skills, postmortems, white papers, and the occasional artifact pried from the floorboards of the code cathedral.',
}: NewsletterSigilProps) {
  return (
    <section className="cz-newsletter" aria-labelledby="newsletter-title">
      <h2 id="newsletter-title">{title}</h2>
      <p>{description}</p>
      <form action="/subscribe" method="post">
        <label className="sr-only" htmlFor="channel-email">
          Email address
        </label>
        <input className="cz-input" id="channel-email" name="email" type="email" placeholder="you@example.com" required />
        <GlyphButton type="submit">Subscribe</GlyphButton>
      </form>
    </section>
  );
}
