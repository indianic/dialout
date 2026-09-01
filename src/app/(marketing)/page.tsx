import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import FleetPanel from '@/components/marketing/FleetPanel';
import { getAppSettings } from '@/lib/app-settings';
import GettingStarted from '@/components/marketing/GettingStarted';
import HeroCta from '@/components/marketing/HeroCta';
import Faq from '@/components/marketing/Faq';
import GithubIcon from '@/components/marketing/GithubIcon';
import {
  DIFFERENTIATORS, FEATURE_GROUPS, USE_CASES, INTEGRATIONS,
  FAQ, COUNTS, GITHUB_URL,
} from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Dialout — your machines, one room',
  description:
    'A self-hosted control room for every project on every machine you own. Ports, terminals, live previews and your AI sessions — one URL, from any browser or your phone.',
};

export default async function HomePage() {
  const policy = await getAppSettings();
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────
          The thesis is the direction of the arrow, so the hero shows
          the fleet list with every connection leaving the machine,
          rather than a screenshot of a dashboard. */}
      <section className="mk-section">
        <div className="mk-wrap">
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
              gap: 56, alignItems: 'center',
            }}
            className="mk-hero-grid"
          >
            <div>
              <h1 className="mk-h1">Your machines, one room.</h1>
              <p className="mk-lede" style={{ marginTop: 20, maxWidth: 520 }}>
                A self-hosted control room for every project on every machine you own.
                Ports, terminals, live previews and your AI sessions — one URL, from any
                browser or your phone.
              </p>
              <p className="mk-body" style={{ marginTop: 16, maxWidth: 520 }}>
                The agent dials out, so nothing has to dial in.
              </p>

              <HeroCta initialPolicy={policy} />
            </div>

            <FleetPanel />
          </div>
        </div>
      </section>

      {/* ── The problem ───────────────────────────────────────────
          Stated as the commands the reader has already typed this
          week, rather than as a claim about their workflow. */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 56, alignItems: 'center' }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">The problem</span>
              <h2 className="mk-h2">Four machines, and no single place that knows what is running.</h2>
              <p className="mk-body" style={{ marginTop: 18, maxWidth: 480 }}>
                So you go and ask each one. Every answer is somewhere else: a port is in{' '}
                <code className="mk-lit">lsof</code>, a process is in{' '}
                <code className="mk-lit">pm2 list</code>, a credential is in a{' '}
                <code className="mk-lit">.env</code> you have to <code className="mk-lit">ssh</code>{' '}
                to read. None of it is wrong. It is just spread across four terminals and your memory.
              </p>
            </div>

            <div className="mk-dark">
              <div className="mk-dark-head">
                <span>Before</span>
                <span aria-hidden="true">4 terminals</span>
              </div>
              <div className="mk-term">
                <span className="mk-term-dim">$ </span><span className="mk-term-cmd">lsof -i :3000</span>{'\n'}
                <span className="mk-term-dim">COMMAND   PID  USER   FD   TYPE  NODE NAME</span>{'\n'}
                <span className="mk-term-dim">node    41822  you    24u  IPv6  TCP *:3000 (LISTEN)</span>{'\n'}
                {'\n'}
                <span className="mk-term-dim">$ </span><span className="mk-term-cmd">ssh build-box</span>{'\n'}
                <span className="mk-term-dim">$ </span><span className="mk-term-cmd">pm2 list</span>{'\n'}
                <span className="mk-term-dim">│ api    │ online  │ 3h  │</span>{'\n'}
                <span className="mk-term-dim">│ worker │ </span><span className="mk-term-off">errored</span><span className="mk-term-dim"> │ 0s  │</span>{'\n'}
                {'\n'}
                <span className="mk-term-dim">$ </span><span className="mk-term-cmd">cat .env | grep DATABASE</span>{'\n'}
                <span className="mk-term-warn">cat: .env: No such file or directory</span>{'\n'}
                <span className="mk-term-dim"># wrong machine</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The four differentiators ──────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">What is different</span>
          <h2 className="mk-h2" style={{ maxWidth: 720 }}>
            Four things that are hard to get in one place.
          </h2>
          <p className="mk-lede" style={{ marginTop: 16, maxWidth: 620 }}>
            Several tools do one of these well. The claim here is that the combination is
            the product, and that the outbound-only agent is what makes the combination
            cheap to run.
          </p>

          <div style={{ marginTop: 44 }}>
            {DIFFERENTIATORS.map((d, i) => (
              <div
                key={d.id}
                style={{
                  display: 'grid', gridTemplateColumns: '58px minmax(0,1fr) minmax(0,1.2fr)',
                  gap: 28, padding: '30px 0', borderTop: '1px solid var(--b1)',
                  alignItems: 'start',
                }}
                className="mk-diff-row"
              >
                {/* These are ordered by how much they matter, not by
                    sequence, so the marker is an index, not a step. */}
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12, color: 'var(--dim)', paddingTop: 4,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="mk-h3">{d.title}</h3>
                  <p className="mk-small" style={{ marginTop: 7, color: 'var(--accent)' }}>{d.claim}</p>
                </div>
                <p className="mk-body">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────
          A real three-step sequence, so numbering earns its place. */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">How it works</span>
          <h2 className="mk-h2">Three moving parts.</h2>

          <div className="mk-grid-3" style={{ marginTop: 36 }}>
            {[
              { n: '01', t: 'The agent starts on your machine', b: 'It connects outbound to your server and holds the socket open. Nothing listens for an inbound connection, so there is nothing to expose.' },
              { n: '02', t: 'Your server holds every socket', b: `One WebSocket process — ${COUNTS.wsServerLines} lines, one file — is the only thing that talks to agents. The web app never does.` },
              { n: '03', t: 'You open one URL', b: 'Ports, terminals, files, processes, tunnels and AI sessions, from any browser or the phone app.' },
            ].map((s) => (
              <div key={s.n} className="mk-card">
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 12, color: 'var(--dim)',
                  }}
                >
                  {s.n}
                </span>
                <h3 className="mk-h3" style={{ marginTop: 10 }}>{s.t}</h3>
                <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>{s.b}</p>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 24 }}>
            <Link href="/how-it-works" className="mk-link">
              The architecture in detail
            </Link>
          </p>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">Features</span>
          <h2 className="mk-h2">What it does.</h2>

          <div className="mk-grid-3" style={{ marginTop: 36 }}>
            {FEATURE_GROUPS.map((g) => (
              <div key={g.id} className="mk-card">
                <h3 className="mk-h3">{g.title}</h3>
                <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>{g.summary}</p>
                <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none' }}>
                  {g.items.slice(0, 4).map((it) => (
                    <li
                      key={it.name}
                      className="mk-small"
                      style={{ padding: '5px 0', borderTop: '1px solid var(--b1)' }}
                    >
                      {it.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 24 }}>
            <Link href="/features" className="mk-link">
              The full feature inventory
            </Link>
          </p>
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">Use cases</span>
          <h2 className="mk-h2">What people actually do with it.</h2>
          <div className="mk-grid-3" style={{ marginTop: 36 }}>
            {USE_CASES.slice(0, 3).map((u) => (
              <div key={u.title} className="mk-card">
                <span className="mk-eyebrow" style={{ marginBottom: 10 }}>{u.who}</span>
                <h3 className="mk-h3">{u.title}</h3>
                <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>{u.body}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 24 }}>
            <Link href="/use-cases" className="mk-link">All use cases</Link>
            {' · '}
            <Link href="/who-its-for" className="mk-link">Who it’s for</Link>
          </p>
        </div>
      </section>

      {/* ── Integrations ─────────────────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section-tight">
        <div className="mk-wrap">
          <span className="mk-eyebrow">Works with</span>
          <div className="mk-grid-4" style={{ marginTop: 20 }}>
            {INTEGRATIONS.slice(0, 8).map((it) => (
              <div key={it.name} style={{ padding: '14px 0', borderTop: '1px solid var(--b1)' }}>
                <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, fontWeight: 600 }}>
                  {it.name}
                </div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 18 }}>
            <Link href="/integrations" className="mk-link">What each one does</Link>
          </p>
        </div>
      </section>

      {/* ── Open source proof ────────────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 56, alignItems: 'center' }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">Open source</span>
              <h2 className="mk-h2">All of it, MIT licensed.</h2>
              <p className="mk-body" style={{ marginTop: 18, maxWidth: 480 }}>
                Server, agent, shared library and mobile app, in one repository. Nothing is
                held back for a paid tier. Read the authorization code before you trust it
                with a machine — that is the point of shipping it this way.
              </p>
              <div className="mk-cta-row" style={{ marginTop: 24 }}>
                <a href={GITHUB_URL} className="mk-cta-ghost" target="_blank" rel="noreferrer noopener">
                  <GithubIcon size={15} /> Read the source
                </a>
                <Link href="/license" className="mk-cta-ghost">The licence</Link>
              </div>
            </div>

            <div className="mk-grid-2">
              {[
                { k: `${COUNTS.apiRoutes}`, v: 'API routes, every one authenticated and every client-supplied id authorized' },
                { k: `${COUNTS.dbTables}`, v: 'database tables, in your own Postgres' },
                { k: `${COUNTS.agentCommands}`, v: 'agent CLI commands, macOS and Linux' },
                { k: `${COUNTS.aiVendors}`, v: 'AI vendors, added without changing the chat surface' },
              ].map((s) => (
                <div key={s.v} className="mk-card">
                  <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 }}>{s.k}</div>
                  <p className="mk-small" style={{ marginTop: 10 }}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Getting started ──────────────────────────────────────
          Replaces what used to be an "install the agent" block. That block
          opened on `npm install`, which is step four: it assumed the reader
          already had an account, a machine registered and a key in hand. */}
      <hr className="mk-rule" />
      <GettingStarted initialPolicy={policy} />

      {/* ── Commercial ───────────────────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">If you would rather not self-host it alone</span>
          <h2 className="mk-h2">The software is free. These are not.</h2>
          <div className="mk-grid-3" style={{ marginTop: 32 }}>
            {[
              { t: 'Professional installation', b: 'We install and configure Dialout on your AWS, Azure, GCP, DigitalOcean or VPS: SSL, database, email, storage, backups, Docker and domain.', href: '/installation-service', cta: 'What is included' },
              { t: 'Enterprise', b: 'Enterprise deployment, custom integrations and development, priority support, migration assistance, security review, architecture consulting and an SLA.', href: '/enterprise', cta: 'Talk to us' },
              { t: 'Support', b: 'Community support is free, in GitHub issues and discussions. Paid support is available if you need a response time in writing.', href: '/support', cta: 'Get support' },
            ].map((c) => (
              <div key={c.t} className="mk-card">
                <h3 className="mk-h3">{c.t}</h3>
                <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>{c.b}</p>
                <p style={{ marginTop: 14 }}>
                  <Link href={c.href} className="mk-link">{c.cta}</Link>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.7fr) minmax(0,1.3fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">Questions</span>
              <h2 className="mk-h2">Before you install it.</h2>
            </div>
            <Faq items={FAQ} />
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2" style={{ maxWidth: 640, margin: '0 auto' }}>
            Put every machine you own in one room.
          </h2>
          <p className="mk-lede" style={{ marginTop: 16, maxWidth: 520, marginInline: 'auto' }}>
            Self-hosted, MIT licensed, and running in about fifteen minutes.
          </p>
          <div className="mk-cta-row" style={{ marginTop: 26, justifyContent: 'center' }}>
            <Link href="/docs/quick-start" className="mk-cta">
              Start with the quick start <ArrowRight size={16} />
            </Link>
            <a href={GITHUB_URL} className="mk-cta-ghost" target="_blank" rel="noreferrer noopener">
              <GithubIcon size={15} /> View on GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
