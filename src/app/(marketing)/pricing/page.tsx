import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import PageHeader from '@/components/marketing/PageHeader';
import Faq from '@/components/marketing/Faq';
import { GITHUB_URL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Pricing — Dialout',
  description:
    'Open source and free forever, self-hosted on your own infrastructure. Enterprise deployment, support and development are quoted per engagement.',
};

const TIERS = [
  {
    name: 'Open Source',
    price: '$0',
    sub: 'Free forever',
    body: 'Everything the product does, on your own server.',
    items: [
      'Self-hosted on your infrastructure',
      'All core features, nothing held back',
      'Full source access, MIT licensed',
      'Community support in issues and discussions',
      'Documentation',
      'Unlimited machines, projects and users',
    ],
    cta: { label: 'Get started free', href: '/docs/quick-start' },
    primary: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    sub: 'Let’s talk',
    body: 'For teams who need the deployment, the integrations and an answer in writing.',
    items: [
      'Everything in Open Source',
      'Enterprise deployment',
      'Custom integrations',
      'Custom development',
      'Priority support',
      'Migration assistance',
      'Security review',
      'Architecture consulting',
      'SLA',
    ],
    cta: { label: 'Contact enterprise', href: '/enterprise' },
    primary: false,
  },
];

const PRICING_FAQ = [
  {
    q: 'Is anything held back for a paid tier?',
    a: 'No. The open-source build is the whole product — terminals, tunnels, AI sessions, sharing, mobile app, all of it. What we sell is our time: installing it, supporting it, and building on it.',
  },
  {
    q: 'What does it cost to run?',
    a: 'Whatever your server costs. One Postgres database and two Node processes run comfortably on a small VPS. There are no per-seat, per-machine or per-project charges, because there is nothing to charge them through.',
  },
  {
    q: 'Can I use it commercially?',
    a: 'Yes. MIT licensed, including inside a company and inside a product you sell. You do not need our permission and you do not owe us anything.',
  },
  {
    q: 'What if I want it installed but not enterprise support?',
    a: 'That is the professional installation service — a one-time setup on your own cloud or VPS, separate from any ongoing arrangement.',
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="The software is free. We sell time, not features."
        lede="No seat count, no feature gate, nothing held back for a paid tier. Run it on your own server, or ask for an account on ours — the software is the same either way, and it is free."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div className="mk-grid-2" style={{ gap: 24, alignItems: 'start' }}>
            {TIERS.map((t) => (
              <div
                key={t.name}
                className="mk-card"
                style={{
                  padding: 32,
                  borderColor: t.primary ? 'var(--b3)' : 'var(--b1)',
                }}
              >
                <h2 className="mk-h3" style={{ fontSize: 17 }}>{t.name}</h2>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
                  <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1 }}>
                    {t.price}
                  </span>
                  <span className="mk-small">{t.sub}</span>
                </div>
                <p className="mk-body" style={{ marginTop: 14, fontSize: 14.5 }}>{t.body}</p>

                <Link
                  href={t.cta.href}
                  className={t.primary ? 'mk-cta' : 'mk-cta-ghost'}
                  style={{ marginTop: 22, width: '100%' }}
                >
                  {t.cta.label}
                </Link>

                <ul style={{ margin: '26px 0 0', padding: 0, listStyle: 'none' }}>
                  {t.items.map((it) => (
                    <li
                      key={it}
                      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0' }}
                    >
                      <Check size={15} style={{ color: 'var(--live)', flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
                      <span className="mk-body" style={{ fontSize: 14.5 }}>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Installation is a service, not a tier. Putting it in the table
              would imply the software is gated behind it, which it is not. */}
          <div
            className="mk-card"
            style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ maxWidth: 620 }}>
              <h2 className="mk-h3">Professional installation</h2>
              <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>
                A one-time setup on your AWS, Azure, GCP, DigitalOcean or VPS — SSL, database,
                email, storage, backups, Docker and domain. Priced per engagement, and separate
                from Enterprise.
              </p>
            </div>
            <Link href="/installation-service" className="mk-cta-ghost">What is included</Link>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.7fr) minmax(0,1.3fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">Pricing questions</span>
              <h2 className="mk-h2">The obvious ones.</h2>
              <p className="mk-body" style={{ marginTop: 14 }}>
                Or read the licence yourself —{' '}
                <a href={GITHUB_URL} className="mk-link" target="_blank" rel="noreferrer noopener">
                  it is in the repository
                </a>.
              </p>
            </div>
            <Faq items={PRICING_FAQ} />
          </div>
        </div>
      </section>
    </>
  );
}
