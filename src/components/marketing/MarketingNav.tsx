'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import GithubIcon from './GithubIcon';
import { Logo } from './Logo';
import { GITHUB_URL } from '@/lib/marketing-content';
import { useSignupPolicy, signupCta, type SignupPolicy } from '@/hooks/useSignupPolicy';

/**
 * Navigation is deliberately short. Everything that is not one of these lives
 * in the footer — a nav that lists every page is a sitemap, and it stops
 * telling the reader which four things actually matter.
 */
const LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/use-cases', label: 'Use cases' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/enterprise', label: 'Enterprise' },
];

export default function MarketingNav({ initialPolicy }: { initialPolicy?: SignupPolicy | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The primary button is the way in, so it has to match what the instance is
  // actually offering. When neither signup nor requests are on there is no way
  // in to offer, and the button falls back to the thing that is always true:
  // the code is public and you can run it yourself.
  const cta = signupCta(useSignupPolicy(initialPolicy));

  const isOn = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="mk-nav" style={{ position: 'sticky' }}>
      <div className="mk-wrap" style={{ position: 'relative' }}>
        <nav className="mk-nav-inner" aria-label="Main">
          <Link href="/" style={{ color: 'var(--txt)', textDecoration: 'none', display: 'inline-flex' }}>
            <Logo size={22} />
          </Link>

          <div className="mk-nav-links">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`mk-nav-link${isOn(l.href) ? ' mk-nav-link-on' : ''}`}
                aria-current={isOn(l.href) ? 'page' : undefined}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <span className="mk-nav-spacer" />

          <span className="mk-nav-aux" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <a
            href={GITHUB_URL}
            className="mk-nav-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            target="_blank"
            rel="noreferrer noopener"
          >
            <GithubIcon size={15} />
            GitHub
          </a>
          <Link href="/login" className="mk-nav-link">
            Log in
          </Link>
          </span>
          <Link
            href={cta ? cta.href : '/docs/quick-start'}
            className="mk-cta"
            style={{ padding: '9px 16px', fontSize: 14 }}
          >
            {cta ? cta.label : 'Get started'}
          </Link>

          <button
            type="button"
            className="mk-nav-toggle mk-cta-ghost"
            style={{ padding: 8, borderRadius: 10 }}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </nav>

        {open ? (
          <div className="mk-menu">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="mk-foot-link"
                style={{ fontSize: 15, padding: '9px 0' }}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="mk-foot-link" style={{ fontSize: 15, padding: '9px 0' }} onClick={() => setOpen(false)}>
              Log in
            </Link>
            {cta ? (
              <Link href={cta.href} className="mk-foot-link" style={{ fontSize: 15, padding: '9px 0' }} onClick={() => setOpen(false)}>
                {cta.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
