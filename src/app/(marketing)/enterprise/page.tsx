import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import EnquiryForm from '@/components/marketing/EnquiryForm';
import { CONTACT_EMAIL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Enterprise — Dialout',
  description:
    'Enterprise deployment, custom integrations and development, priority support, migration assistance, security review, architecture consulting and an SLA.',
};

const OFFERINGS = [
  { t: 'Enterprise deployment', b: 'Installed into your environment, against your identity, network and compliance constraints rather than around them.' },
  { t: 'Custom integrations', b: 'Connecting Dialout to the systems you already run — internal registries, CI, ticketing, or a CLI we do not support yet.' },
  { t: 'Custom development', b: 'Features built for your workflow, in the open-source codebase, so you are not maintaining a fork.' },
  { t: 'Priority support', b: 'A named contact and a response time in writing, rather than a queue.' },
  { t: 'Migration assistance', b: 'Moving from whatever combination of scripts, dashboards and tunnels you are running today.' },
  { t: 'Security review', b: 'A walkthrough of the auth model, per-route authorization, encryption at rest and the deployment surface, with your security team in the room.' },
  { t: 'Architecture consulting', b: 'How to run it at your size — where the WebSocket process lives, how agents are provisioned, what to firewall.' },
  { t: 'SLA', b: 'Availability and response commitments, in a contract.' },
];

export default function EnterprisePage() {
  return (
    <>
      <PageHeader
        eyebrow="Enterprise"
        title="Same software. Our time, in a contract."
        lede="The product does not change. What you are buying is deployment into your environment, development against your requirements, and someone who has to answer the phone."
      >
        <div className="mk-cta-row" style={{ marginTop: 28 }}>
          <a href="#enquiry" className="mk-cta">Start an enquiry</a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="mk-cta-ghost">{CONTACT_EMAIL}</a>
        </div>
      </PageHeader>

      <section className="mk-section">
        <div className="mk-wrap">
          <span className="mk-eyebrow">What is included</span>
          <h2 className="mk-h2">Scoped per engagement.</h2>
          <div className="mk-grid-2" style={{ marginTop: 30 }}>
            {OFFERINGS.map((o) => (
              <div key={o.t} style={{ padding: '18px 0', borderTop: '1px solid var(--b1)' }}>
                <h3 className="mk-h3">{o.t}</h3>
                <p className="mk-body" style={{ marginTop: 8, fontSize: 14.5 }}>{o.b}</p>
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
              <span className="mk-eyebrow">Before you contact us</span>
              <h2 className="mk-h2">You can evaluate all of it first.</h2>
            </div>
            <div>
              <p className="mk-body">
                Nothing is behind a sales call. Install it, run it on your own machines, and read
                the authorization code — it is the part that matters most and it is all in the
                repository. Come to us when you have a question that needs an answer with a name
                attached to it.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                If your security team needs to review it before it touches a developer machine,
                the security policy in the repository is written for exactly that read.
              </p>
              <div className="mk-cta-row" style={{ marginTop: 24 }}>
                <Link href="/docs/quick-start" className="mk-cta-ghost">Evaluate it first</Link>
                <a href="#enquiry" className="mk-cta">Start an enquiry</a>
              </div>
            </div>
          </div>
        </div>
      </section>
      <hr className="mk-rule" />
      <section className="mk-section" id="enquiry">
        <div className="mk-wrap">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.2fr)',
              gap: 48,
              alignItems: 'start',
            }}
            className="mk-hero-grid"
          >
            <div>
              <span className="mk-eyebrow">Enterprise enquiry</span>
              <h2 className="mk-h2">Tell us what you are running.</h2>
              <p className="mk-body" style={{ marginTop: 16 }}>
                How many machines and people, where you would host it, and whether there is a
                security review to get through. Those three answers decide the shape of the
                engagement, so having them up front saves a call.
              </p>
              <p className="mk-body" style={{ marginTop: 14 }}>
                You get a copy of what you send. A person replies, usually within one working day.
              </p>
            </div>

            <EnquiryForm
              kind="enterprise"
              sourcePage="/enterprise"
              doneTitle="Thanks — your enquiry is in."
            />
          </div>
        </div>
      </section>
    </>
  );
}
