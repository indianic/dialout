import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import { CONTACT_EMAIL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Professional installation — Dialout',
  description:
    'We install and configure Dialout on your AWS, Azure, GCP, DigitalOcean or VPS: SSL, database, email, storage, backups, Docker and domain.',
};

const INCLUDED = [
  { t: 'Server provisioning', b: 'On your AWS, Azure, GCP, DigitalOcean or plain VPS account. You own the infrastructure and the bill.' },
  { t: 'SSL certificates', b: 'Issued and set to renew, so the WebSocket upgrade keeps working past day ninety.' },
  { t: 'Database', b: 'PostgreSQL installed, tuned for the workload, and locked to local connections.' },
  { t: 'Email', b: 'SMTP configured and tested, so PIN resets and share invitations actually arrive.' },
  { t: 'Storage and backups', b: 'A backup schedule that has been restored from at least once in front of you.' },
  { t: 'Docker', b: 'Where you would rather run it in containers than on the host.' },
  { t: 'Domain and reverse proxy', b: 'DNS, the vhost, and the proxy rules that forward the WebSocket upgrade correctly.' },
  { t: 'Agent rollout', b: 'The agent installed as a service on your first machines, with the cron watchdog in place.' },
  { t: 'Handover', b: 'A walkthrough of what was installed where, and how to update it, in writing.' },
];

export default function InstallationServicePage() {
  return (
    <>
      <PageHeader
        eyebrow="Professional installation"
        title="We set it up on your infrastructure."
        lede="A one-time engagement for teams who want it running properly this week rather than eventually. It is your server, your data and your account — we do the setup and hand you the keys."
      >
        <div className="mk-cta-row" style={{ marginTop: 28 }}>
          <Link href="/contact" className="mk-cta">Request installation</Link>
          <Link href="/docs/installation" className="mk-cta-ghost">Or do it yourself</Link>
        </div>
      </PageHeader>

      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">What is included</span>
          <h2 className="mk-h2">The whole setup, not the easy half.</h2>
          <div className="mk-grid-3" style={{ marginTop: 30 }}>
            {INCLUDED.map((i) => (
              <div key={i.t} className="mk-card">
                <h3 className="mk-h3">{i.t}</h3>
                <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>{i.b}</p>
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
              <span className="mk-eyebrow">What this is not</span>
              <h2 className="mk-h2">You are not buying the software.</h2>
            </div>
            <div>
              <p className="mk-body">
                Dialout is MIT licensed and free, and the installation guide is public. Everything
                we do in this engagement, you could do yourself in an afternoon or two — this is
                for when that afternoon is worth more to you than the fee.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                It is also not a hosting arrangement. The server stays in your account, the
                database stays yours, and we do not keep access after handover unless you ask us
                to as part of a support agreement.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                Pricing depends on the environment and the number of machines. Tell us what you
                are running and we will quote it.
              </p>
              <div className="mk-cta-row" style={{ marginTop: 24 }}>
                <a href={`mailto:${CONTACT_EMAIL}`} className="mk-cta">{CONTACT_EMAIL}</a>
                <Link href="/enterprise" className="mk-cta-ghost">Ongoing support instead</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
