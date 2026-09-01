import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import PageHeader from '@/components/marketing/PageHeader';
import { GITHUB_URL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Documentation — Dialout',
  description: 'Quick start, server installation, and the HTTP API for native clients.',
};

const SECTIONS = [
  {
    href: '/docs/quick-start',
    t: 'Quick start',
    b: 'From nothing to a machine showing green. The server, then the agent, then a first project.',
    meta: '~15 minutes',
  },
  {
    href: '/docs/installation',
    t: 'Installation',
    b: 'The full server setup: environment, database, reverse proxy, process manager, and the agent on each machine.',
    meta: 'Reference',
  },
  {
    href: '/docs/api',
    t: 'API',
    b: 'The HTTP contract for native clients — authentication, bearer tokens, and where the OpenAPI document lives.',
    meta: 'Reference',
  },
];

export default function DocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Documentation"
        title="Start here."
        lede="Three documents. The quick start gets it running; the other two are for when you want to know why something is the way it is."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div className="mk-grid-3">
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="mk-card"
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <span className="mk-eyebrow" style={{ marginBottom: 10 }}>{s.meta}</span>
                <h2 className="mk-h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.t} <ArrowRight size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                </h2>
                <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>{s.b}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">Deeper</span>
              <h2 className="mk-h2">The rest is in the repository.</h2>
            </div>
            <div>
              <p className="mk-body">
                The architecture map, the narrative product guide, and the design documents behind
                each feature live alongside the code, because that is the only place they stay
                true. If you are about to change something, read the document that covers it
                first — several of them exist specifically to record why an obvious approach was
                the wrong one.
              </p>
              <div className="mk-cta-row" style={{ marginTop: 22 }}>
                <a href={GITHUB_URL} className="mk-cta-ghost" target="_blank" rel="noreferrer noopener">
                  Browse the repository
                </a>
                <Link href="/how-it-works" className="mk-cta-ghost">How it works</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
