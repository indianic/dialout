import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { USE_CASES } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Use cases — Dialout',
  description:
    'Showing a client a branch without deploying, keeping a build alive after you close the laptop, and watching a fleet of coding agents.',
};

export default function UseCasesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Use cases"
        title="What people actually open it for."
        lede="Not personas — situations. Each of these is a thing that was annoying enough to build a feature for."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          {USE_CASES.map((u, i) => (
            <div
              key={u.title}
              style={{
                display: 'grid', gridTemplateColumns: '58px minmax(0,1fr) minmax(0,1.3fr)',
                gap: 28, padding: '30px 0', borderTop: i === 0 ? 0 : '1px solid var(--b1)',
                alignItems: 'start',
              }}
              className="mk-diff-row"
            >
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: 'var(--dim)', paddingTop: 4 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h2 className="mk-h3" style={{ fontSize: 20 }}>{u.title}</h2>
                <p className="mk-small" style={{ marginTop: 7, color: 'var(--accent)' }}>{u.who}</p>
              </div>
              <p className="mk-body">{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">See whether it fits how you work.</h2>
          <div className="mk-cta-row" style={{ marginTop: 22, justifyContent: 'center' }}>
            <Link href="/who-its-for" className="mk-cta">Who it’s for</Link>
            <Link href="/demo" className="mk-cta-ghost">See it running</Link>
          </div>
        </div>
      </section>
    </>
  );
}
