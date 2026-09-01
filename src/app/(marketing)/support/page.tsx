import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { GITHUB_URL, SECURITY_EMAIL, CONTACT_EMAIL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Support — Dialout',
  description:
    'Community support in GitHub issues and discussions, private reporting for security issues, and paid support when you need a response time in writing.',
};

export default function SupportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Where to take a problem."
        lede="Pick by what kind of problem it is. Getting this right is the difference between an answer today and a thread nobody is watching."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div className="mk-grid-3">
            <div className="mk-card">
              <h2 className="mk-h3">Something is broken</h2>
              <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>
                Open an issue. The bug template asks for the component, your Node and Postgres
                versions and the agent version, because those three answer most reports on their
                own.
              </p>
              <p style={{ marginTop: 14 }}>
                <a href={`${GITHUB_URL}/issues/new/choose`} className="mk-link" target="_blank" rel="noreferrer noopener">
                  Open an issue
                </a>
              </p>
            </div>

            <div className="mk-card">
              <h2 className="mk-h3">You have a question</h2>
              <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>
                Discussions, not issues. Setup questions, “is this supposed to work like this”, and
                anything where you are not yet sure it is a bug.
              </p>
              <p style={{ marginTop: 14 }}>
                <a href={`${GITHUB_URL}/discussions`} className="mk-link" target="_blank" rel="noreferrer noopener">
                  Ask in discussions
                </a>
              </p>
            </div>

            <div className="mk-card" style={{ borderColor: 'var(--b3)' }}>
              <h2 className="mk-h3">You found a vulnerability</h2>
              <p className="mk-body" style={{ marginTop: 9, fontSize: 14.5 }}>
                Do not open a public issue. Use private vulnerability reporting on the repository,
                or email us. Acknowledgement within three working days.
              </p>
              <p style={{ marginTop: 14 }}>
                <a href={`mailto:${SECURITY_EMAIL}`} className="mk-link">{SECURITY_EMAIL}</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)', gap: 48 }} className="mk-hero-grid">
            <div>
              <span className="mk-eyebrow">Before you file</span>
              <h2 className="mk-h2">Three things that fix most of it.</h2>
            </div>
            <div>
              {[
                { t: 'The agent shows offline', b: 'Run the agent’s status command. A 401 on the daemon connection means the machine’s API key is not registered on the server, not that the agent is misconfigured — re-enrol the machine from Settings → Machines.' },
                { t: 'Terminals connect but nothing happens', b: 'The reverse proxy is almost certainly not forwarding the WebSocket upgrade. The web app and the WebSocket server are two different ports and both need to be reachable.' },
                { t: 'A column is missing after a deploy', b: 'The migration script exists but was never added to the ordered list the deploy runs. That is a deliberate loud failure — add it and redeploy.' },
              ].map((x) => (
                <div key={x.t} style={{ padding: '16px 0', borderTop: '1px solid var(--b1)' }}>
                  <h3 className="mk-h3">{x.t}</h3>
                  <p className="mk-body" style={{ marginTop: 7, fontSize: 14.5 }}>{x.b}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">Need a response time in writing?</h2>
          <p className="mk-lede" style={{ marginTop: 14, maxWidth: 520, marginInline: 'auto' }}>
            Community support is free and public. Paid support gives you a named contact and an
            SLA.
          </p>
          <div className="mk-cta-row" style={{ marginTop: 24, justifyContent: 'center' }}>
            <Link href="/enterprise" className="mk-cta">Enterprise support</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="mk-cta-ghost">{CONTACT_EMAIL}</a>
          </div>
        </div>
      </section>
    </>
  );
}
