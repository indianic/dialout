import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import PageHeader from '@/components/marketing/PageHeader';
import AccessRequestForm from '@/components/marketing/AccessRequestForm';
import { getAppSettings } from '@/lib/app-settings';
import { GITHUB_URL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Request access — Dialout',
  description:
    'Ask for an account on dialout.dev. Reach your office, home and build machines from any browser or your phone. Free and open source — you can also self-host it today.',
};

// The page reads the live policy on every request. A cached "requests are open"
// served after the operator closed them is the one failure this page has.
export const dynamic = 'force-dynamic';

const STEPS = [
  {
    n: '1',
    t: 'Ask for an invite',
    b: 'Fill in the short form below. It takes about thirty seconds.',
  },
  {
    n: '2',
    t: 'We send you a link',
    b: 'A person reads every request. Approved ones get an email with a link that works once.',
  },
  {
    n: '3',
    t: 'Create your account',
    b: 'Pick a 4-digit code and set up two-factor. Two minutes.',
  },
  {
    n: '4',
    t: 'Connect your first computer',
    b: 'Add the machine, copy the key it gives you, then run one install command on that computer. It appears in your dashboard.',
  },
];

export default async function EarlyAccessPage() {
  const settings = await getAppSettings();

  // Registration is wide open, so there is nothing to queue for — send them to
  // sign up instead of showing a form that would be refused.
  if (settings.signupEnabled) redirect('/');

  // Requests are closed too. Rather than a dead end, this becomes the page that
  // explains the honest alternative: the whole thing is open source.
  if (!settings.trialEnabled) {
    return (
      <>
        <PageHeader
          eyebrow="Access"
          title="Accounts are closed right now."
          lede="We are not taking new sign-ups on this instance at the moment. There is still a way in, and it is the one we would recommend anyway."
        />
        <section className="mk-section">
          <div className="mk-wrap" style={{ maxWidth: 680 }}>
            <div className="mk-card" style={{ padding: 28 }}>
              <h2 className="mk-h3" style={{ fontSize: 20 }}>Run your own copy</h2>
              <p className="mk-body" style={{ marginTop: 12 }}>
                Dialout is MIT licensed and built to be self-hosted. Everything on this
                site is in the repository — the dashboard, the server, the agent. One
                PostgreSQL database and two Node processes, and your data stays on your
                own machine.
              </p>
              <div className="mk-cta-row" style={{ marginTop: 22 }}>
                <a href={GITHUB_URL} className="mk-cta" target="_blank" rel="noreferrer noopener">
                  Get it on GitHub
                </a>
                <Link href="/docs/installation" className="mk-cta-ghost">Installation guide</Link>
              </div>
            </div>
            <p className="mk-small" style={{ marginTop: 18 }}>
              Already invited? Use the link in your email — it takes you straight to sign-up.
            </p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Ask for an account."
        lede="We are letting people in a few at a time so we can help each of them get set up properly. Tell us who you are and we will send you a link."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div
            className="mk-split"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)',
              gap: 56,
              alignItems: 'start',
            }}
          >
            <div>
              <h2 className="mk-h3" style={{ fontSize: 20 }}>What happens next</h2>
              <ol style={{ listStyle: 'none', padding: 0, margin: '20px 0 0' }}>
                {STEPS.map((s) => (
                  <li key={s.n} style={{ display: 'flex', gap: 16, paddingBottom: 22 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0, width: 26, height: 26, borderRadius: 999,
                        display: 'grid', placeItems: 'center',
                        background: 'var(--accent-weak)', color: 'var(--accent)',
                        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {s.n}
                    </span>
                    <span>
                      <strong style={{ display: 'block', fontSize: 15, color: 'var(--txt)' }}>{s.t}</strong>
                      <span className="mk-body" style={{ display: 'block', marginTop: 5 }}>{s.b}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <div
                style={{
                  marginTop: 8, paddingTop: 22,
                  borderTop: '1px solid var(--b2)',
                }}
              >
                <p className="mk-body">
                  <strong style={{ color: 'var(--txt)' }}>Don’t want to wait?</strong> Dialout is
                  open source and free. You can run your own copy today and never need an
                  invite at all.
                </p>
                <div className="mk-cta-row" style={{ marginTop: 16 }}>
                  <a href={GITHUB_URL} className="mk-cta-ghost" target="_blank" rel="noreferrer noopener">
                    Self-host it instead
                  </a>
                </div>
              </div>
            </div>

            <AccessRequestForm sourcePage="/early-access" />
          </div>
        </div>
      </section>
    </>
  );
}
