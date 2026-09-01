import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { FEATURE_GROUPS } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Features — Dialout',
  description:
    'Projects, terminals, AI sessions, tunnels and account security. The full inventory of what Dialout does, one section per group.',
};

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="Everything it does, in one list."
        lede="Grouped the way the dashboard groups it. If a feature has a constraint worth knowing before you rely on it, the constraint is named here rather than left for you to find."
      />

      {FEATURE_GROUPS.map((g, gi) => (
        <div key={g.id}>
          {gi > 0 ? <hr className="mk-rule" /> : null}
          <section className="mk-section" id={g.id}>
            <div className="mk-wrap">
              <div
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.75fr) minmax(0,1.25fr)', gap: 48 }}
                className="mk-hero-grid"
              >
                <div>
                  <span className="mk-eyebrow">{String(gi + 1).padStart(2, '0')}</span>
                  <h2 className="mk-h2">{g.title}</h2>
                  <p className="mk-body" style={{ marginTop: 14 }}>{g.summary}</p>
                </div>

                <div>
                  {g.items.map((it) => (
                    <div key={it.name} style={{ padding: '18px 0', borderTop: '1px solid var(--b1)' }}>
                      <h3 className="mk-h3">{it.name}</h3>
                      <p className="mk-body" style={{ marginTop: 7, fontSize: 14.5 }}>{it.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      ))}

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">Read how it fits together.</h2>
          <div className="mk-cta-row" style={{ marginTop: 22, justifyContent: 'center' }}>
            <Link href="/how-it-works" className="mk-cta">How it works</Link>
            <Link href="/docs/quick-start" className="mk-cta-ghost">Quick start</Link>
          </div>
        </div>
      </section>
    </>
  );
}
