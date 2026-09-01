import Link from 'next/link';
import { Logo } from './Logo';
import GithubIcon from './GithubIcon';
import { GITHUB_URL, CONTACT_EMAIL } from '@/lib/marketing-content';

/**
 * The footer carries everything the nav deliberately leaves out. Grouped by
 * what the reader is trying to do — understand it, run it, or talk to someone
 * — rather than by which team owns the page.
 */
const COLUMNS = [
  {
    head: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/demo', label: 'Demo' },
      { href: '/use-cases', label: 'Use cases' },
      { href: '/who-its-for', label: 'Who it’s for' },
    ],
  },
  {
    head: 'Run it',
    links: [
      { href: '/docs/quick-start', label: 'Quick start' },
      { href: '/docs/installation', label: 'Installation' },
      { href: '/docs/api', label: 'API' },
      { href: '/docs', label: 'All docs' },
      { href: '/installation-service', label: 'Installation service' },
    ],
  },
  {
    head: 'Company',
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/enterprise', label: 'Enterprise' },
      { href: '/support', label: 'Support' },
      { href: '/contact', label: 'Contact' },
      { href: '/license', label: 'Licence' },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="mk-foot">
      <div className="mk-wrap">
        <div className="mk-foot-grid">
          <div>
            <Link href="/" style={{ color: 'var(--txt)', textDecoration: 'none', display: 'inline-flex' }}>
              <Logo size={22} />
            </Link>
            <p className="mk-small" style={{ marginTop: 12, maxWidth: 260 }}>
              Your machines, one room. The agent dials out, so nothing has to dial in.
            </p>
            <a
              href={GITHUB_URL}
              className="mk-foot-link"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12 }}
              target="_blank"
              rel="noreferrer noopener"
            >
              <GithubIcon size={14} />
              Source on GitHub
            </a>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.head}>
              <div className="mk-foot-head">{col.head}</div>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href} className="mk-foot-link">
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <hr className="mk-rule" style={{ margin: '36px 0 20px' }} />

        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 14,
            alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <p className="mk-small" style={{ margin: 0 }}>
            MIT licensed. Copyright &copy; 2026 IndiaNIC Infotech Ltd.
          </p>
          <p className="mk-small" style={{ margin: 0 }}>
            <a href={`mailto:${CONTACT_EMAIL}`} className="mk-link">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
