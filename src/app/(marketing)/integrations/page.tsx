import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { INTEGRATIONS } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Integrations — Dialout',
  description:
    'tmux, Claude Code, Codex, Grok, PostgreSQL, PM2, launchd and systemd, web push, and any reverse proxy that forwards a WebSocket upgrade.',
};

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Integrations"
        title="What it plugs into."
        lede="Mostly things you already run. Dialout reads what these tools already write rather than asking them to report to it."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div className="mk-grid-3">
            {INTEGRATIONS.map((it) => (
              <div key={it.name} className="mk-card">
                <h2
                  className="mk-h3"
                  style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 15 }}
                >
                  {it.name}
                </h2>
                <p className="mk-body" style={{ marginTop: 10, fontSize: 14.5 }}>{it.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">Adding a vendor</span>
              <h2 className="mk-h2">A missing adapter is a compile error.</h2>
            </div>
            <div>
              <p className="mk-body">
                The AI vendor list is a union type and the adapter table is keyed by it, so adding
                a fourth CLI without writing its adapter does not compile. That is deliberate: the
                failure that matters here is a vendor that is half-supported at runtime, and this
                turns it into a build failure instead.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                If you want a vendor supported, the work is one adapter and one locator — open an
                issue and say which CLI.
              </p>
              <div className="mk-cta-row" style={{ marginTop: 22 }}>
                <Link href="/support" className="mk-cta-ghost">Request an integration</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
