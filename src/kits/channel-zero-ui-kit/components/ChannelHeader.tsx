import { GlyphButton } from './GlyphButton';

export type ChannelNavItem = {
  href: string;
  label: string;
};

export type ChannelHeaderProps = {
  homeHref?: string;
  navItems?: ChannelNavItem[];
};

const DEFAULT_NAV: ChannelNavItem[] = [
  { href: '/blog', label: 'Blog' },
  { href: '/skills', label: 'Skills' },
  { href: '/whitepapers', label: 'Whitepapers' },
  { href: '/verdicts', label: 'Verdicts' },
];

export function ChannelHeader({ homeHref = '/', navItems = DEFAULT_NAV }: ChannelHeaderProps) {
  return (
    <header className="cz-header">
      <div className="cz-header__inner">
        <a className="cz-brand" href={homeHref} aria-label="The Scholomance Channel: Zero home">
          <span className="cz-brand__sigil">Signal Origin 00</span>
          <span className="cz-brand__title">The Scholomance Channel: Zero</span>
        </a>

        <nav className="cz-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <GlyphButton href="/subscribe" variant="ghost">
            Subscribe
          </GlyphButton>
        </nav>
      </div>
    </header>
  );
}
