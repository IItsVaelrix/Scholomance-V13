import { GlyphButton } from './GlyphButton';

export type ArticleHeroProps = {
  eyebrow?: string;
  signalReadout?: string[];
  title: string;
  lede: string;
  ctaHref?: string;
  ctaLabel?: string;
  /** Render the decorative cosmic aperture + orbiting moons (hero-only crown). */
  aperture?: boolean;
};

export function ArticleHero({
  eyebrow = 'The origin feed for creative engineering doctrine',
  signalReadout,
  title,
  lede,
  ctaHref = '/skills',
  ctaLabel = 'Enter the Skills Index',
  aperture = false,
}: ArticleHeroProps) {
  return (
    <section className="cz-hero">
      {aperture && (
        <div className="cz-aperture" aria-hidden="true">
          <span className="cz-aperture__core" />
          <span className="cz-aperture__orbit cz-aperture__orbit--1">
            <i className="cz-aperture__moon" />
          </span>
          <span className="cz-aperture__orbit cz-aperture__orbit--2">
            <i className="cz-aperture__moon" />
          </span>
          <span className="cz-aperture__orbit cz-aperture__orbit--3">
            <i className="cz-aperture__moon" />
          </span>
        </div>
      )}
      {signalReadout && signalReadout.length > 0 && (
        <aside className="cz-origin-readout" aria-label="Channel Zero signal status">
          {signalReadout.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </aside>
      )}
      <div className="cz-hero__eyebrow">
        <span aria-hidden="true">✦</span>
        {eyebrow}
      </div>
      <h1 className="cz-hero__title">{title}</h1>
      <p className="cz-hero__lede">{lede}</p>
      <p>
        <GlyphButton href={ctaHref}>{ctaLabel}</GlyphButton>
      </p>
    </section>
  );
}
