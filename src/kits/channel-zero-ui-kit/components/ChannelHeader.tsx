import { Link, useSearchParams } from 'react-router-dom';
import { GlyphButton } from './GlyphButton';

export type ChannelNavItem = {
  /** In-app target (React Router). */
  to: string;
  label: string;
  /** The `?kind=` value this item filters to (null = "all"). Drives active state. */
  kind: string | null;
};

export type ChannelHeaderProps = {
  homeHref?: string;
  navItems?: ChannelNavItem[];
};

/** Sub-nav links are category filters on the index, not separate pages. */
const DEFAULT_NAV: ChannelNavItem[] = [
  { to: '/blog', label: 'Blog', kind: null },
  { to: '/blog?kind=skill', label: 'Skills', kind: 'skill' },
  { to: '/blog?kind=whitepaper', label: 'Whitepapers', kind: 'whitepaper' },
  { to: '/blog?kind=verdict', label: 'Verdicts', kind: 'verdict' },
];

// External subscribe provider -- Damien stores/sees nothing. Unset → disabled.
const SUBSCRIBE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BLOG_SUBSCRIBE_URL) || '';

export function ChannelHeader({ homeHref = '/', navItems = DEFAULT_NAV }: ChannelHeaderProps) {
  const [searchParams] = useSearchParams();
  const currentKind = searchParams.get('kind');

  return (
    <header className="cz-header">
      <div className="cz-header__inner">
        <a className="cz-brand" href={homeHref} aria-label="The Scholomance Channel: Zero home">
          <span className="cz-brand__sigil">Signal Origin 00</span>
          <span className="cz-brand__title">The Scholomance Channel: Zero</span>
        </a>

        <nav className="cz-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = item.kind === null ? currentKind === null : currentKind === item.kind;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                data-active={isActive ? 'true' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          {SUBSCRIBE_URL ? (
            <GlyphButton href={SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer" variant="ghost">
              Subscribe
            </GlyphButton>
          ) : (
            <GlyphButton
              variant="ghost"
              disabled
              aria-disabled="true"
              title="Subscriptions aren't configured yet (set VITE_BLOG_SUBSCRIBE_URL)."
            >
              Subscribe
            </GlyphButton>
          )}
        </nav>
      </div>
    </header>
  );
}
