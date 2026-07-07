import { Link } from 'react-router-dom';

export type ArticleHeroProps = {
  eyebrow?: string;
  title: string;
  lede: string;
  /** In-app target for the CTA (React Router). Defaults to the Skills band filter. */
  ctaHref?: string;
  ctaLabel?: string;
  /** Render the decorative cosmic aperture + orbiting moons (hero-only crown). */
  aperture?: boolean;
};

export function ArticleHero({
  eyebrow = 'The origin feed for creative engineering doctrine',
  title,
  lede,
  ctaHref = '/blog?kind=skill',
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
      <div className="cz-hero__eyebrow">
        <span aria-hidden="true">✦</span>
        {eyebrow}
      </div>
      <h1 className="cz-hero__title">{title}</h1>
      <p className="cz-hero__lede">{lede}</p>
      <p>
        <Link className="cz-button" data-variant="solid" to={ctaHref}>
          <span aria-hidden="true">◇</span>
          {ctaLabel}
        </Link>
      </p>
    </section>
  );
}
