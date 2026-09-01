'use client';

import Link from 'next/link';
import { Laptop, MonitorSmartphone } from 'lucide-react';
import CopyCommand from './CopyCommand';
import { GETTING_STARTED, GITHUB_URL } from '@/lib/marketing-content';
import { useSignupPolicy, signupCta, type SignupPolicy } from '@/hooks/useSignupPolicy';

/**
 * The whole journey from "never heard of this" to "my office Mac is on my
 * phone", as one numbered list.
 *
 * Two decisions carry it:
 *
 * 1. **One list for both audiences.** Each step leads with a plain sentence
 *    anyone can follow and puts the specifics underneath in smaller type. Two
 *    versions of the same instructions is how the non-technical one goes stale.
 *
 * 2. **Every step says where it happens.** The single most common way this
 *    setup fails is running the install command on the laptop you are browsing
 *    from rather than on the computer you are trying to reach. The badge is
 *    there to make that impossible to misread.
 */
export default function GettingStarted({ initialPolicy }: { initialPolicy?: SignupPolicy | null }) {
  const cta = signupCta(useSignupPolicy(initialPolicy));

  return (
    <section className="mk-section">
      <div className="mk-wrap">
        <span className="mk-eyebrow">Getting started</span>
        <h2 className="mk-h2">From nothing to your first machine, in about ten minutes.</h2>
        <p className="mk-body" style={{ marginTop: 16, maxWidth: 620 }}>
          You need two things: an account, and a small program on each computer you want
          to reach. Nothing is opened on your network — the program dials out.
        </p>

        <ol style={{ listStyle: 'none', padding: 0, margin: '36px 0 0', maxWidth: 780 }}>
          {GETTING_STARTED.map((s, i) => (
            <li
              key={s.title}
              style={{
                display: 'grid',
                gridTemplateColumns: '34px minmax(0, 1fr)',
                gap: 20,
                paddingBottom: i === GETTING_STARTED.length - 1 ? 0 : 30,
              }}
              className="mk-diff-row"
            >
              <span
                aria-hidden="true"
                style={{
                  width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center',
                  background: 'var(--accent-weak)', color: 'var(--accent)',
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 12.5, fontWeight: 700,
                }}
              >
                {i + 1}
              </span>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h3 className="mk-h3" style={{ fontSize: 17 }}>{s.title}</h3>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--dim)', border: '1px solid var(--b2)',
                      borderRadius: 999, padding: '3px 9px',
                    }}
                  >
                    {s.where === 'browser'
                      ? <><MonitorSmartphone size={11} aria-hidden="true" /> In your browser</>
                      : <><Laptop size={11} aria-hidden="true" /> On that computer</>}
                  </span>
                </div>

                <p className="mk-body" style={{ marginTop: 9, fontSize: 15.5, color: 'var(--txt)' }}>
                  {s.plain}
                </p>
                <p className="mk-small" style={{ marginTop: 8, lineHeight: 1.65 }}>
                  {s.detail}
                </p>

                {s.command ? (
                  <div style={{ marginTop: 14 }}>
                    <CopyCommand command={s.command} note={s.note} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mk-cta-row" style={{ marginTop: 38 }}>
          {cta ? (
            <Link href={cta.href} className="mk-cta">{cta.label}</Link>
          ) : null}
          <a href={GITHUB_URL} className="mk-cta-ghost" target="_blank" rel="noreferrer noopener">
            Run your own copy
          </a>
          <Link href="/docs/installation" className="mk-cta-ghost">Installation guide</Link>
        </div>
      </div>
    </section>
  );
}
