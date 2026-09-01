import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/marketing/PageHeader';
import EnquiryForm from '@/components/marketing/EnquiryForm';
import { CONTACT_EMAIL, SECURITY_EMAIL, GITHUB_URL } from '@/lib/marketing-content';

export const metadata: Metadata = {
  title: 'Contact — Dialout',
  description: 'Get in touch about enterprise deployment, installation, support or security.',
};

// Two things belong outside the form. Security reports need to be private, and
// bugs are better in public where the next person hits the same thing.
const ROUTES = [
  {
    t: 'Security',
    b: 'Private vulnerability reporting. Please do not use the form, and do not open a public issue.',
    link: { label: SECURITY_EMAIL, href: `mailto:${SECURITY_EMAIL}` },
  },
  {
    t: 'Bugs and questions',
    b: 'Public, and usually faster — other people hit the same things. Issues for bugs, discussions for questions.',
    link: { label: 'GitHub', href: GITHUB_URL },
  },
  {
    t: 'Prefer plain email?',
    b: 'The form goes to this address anyway. Use it directly if you would rather attach something.',
    link: { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Tell us what you need."
        lede="The form reaches a person, and you get a copy of what you sent. Usually a reply within one working day."
      />

      <section className="mk-section">
        <div className="mk-wrap">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,.85fr)',
              gap: 48,
              alignItems: 'start',
            }}
            className="mk-hero-grid"
          >
            <EnquiryForm kind="contact" sourcePage="/contact" />

            <div>
              <span className="mk-eyebrow">Or go direct</span>
              <p className="mk-body" style={{ marginTop: 10 }}>
                Some things are better off not going through a form.
              </p>
              {ROUTES.map((r) => (
                <div key={r.t} style={{ padding: '18px 0', borderTop: '1px solid var(--b1)', marginTop: 14 }}>
                  <h2 className="mk-h3">{r.t}</h2>
                  <p className="mk-body" style={{ marginTop: 7, fontSize: 14 }}>{r.b}</p>
                  <p style={{ marginTop: 10 }}>
                    <a
                      href={r.link.href}
                      className="mk-link"
                      {...(r.link.href.startsWith('http')
                        ? { target: '_blank', rel: 'noreferrer noopener' }
                        : {})}
                    >
                      {r.link.label}
                    </a>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="mk-rule" />
      <section className="mk-section">
        <div className="mk-wrap" style={{ textAlign: 'center' }}>
          <h2 className="mk-h2">Or just install it.</h2>
          <p className="mk-lede" style={{ marginTop: 14, maxWidth: 480, marginInline: 'auto' }}>
            Nothing is behind a sales conversation.
          </p>
          <div className="mk-cta-row" style={{ marginTop: 24, justifyContent: 'center' }}>
            <Link href="/docs/quick-start" className="mk-cta">Quick start</Link>
          </div>
        </div>
      </section>
    </>
  );
}
